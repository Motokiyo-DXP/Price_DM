-- /register has a small, interactive candidate list. Keep its query separate
-- from the shared search RPC so the other search screens retain their contract.
-- The B-tree indexes serve 1-2 character prefix queries, for which trigram
-- contains searches are not selective enough to meet the interactive budget.
create index card_search_terms_normalized_prefix_idx
  on public.card_search_terms (normalized_term text_pattern_ops);

create index card_prints_card_number_lower_prefix_active_idx
  on public.card_prints (pg_catalog.lower(card_number) text_pattern_ops)
  where card_number is not null and deleted_at is null;

create index card_prints_product_name_lower_prefix_active_idx
  on public.card_prints (pg_catalog.lower(product_name) text_pattern_ops)
  where product_name is not null and deleted_at is null;

create function public.search_registration_cards(
  p_query text,
  p_game_slug text default null,
  p_limit integer default 30,
  p_mode text default 'broad'
)
returns table(
  id bigint,
  game_slug text,
  game_name text,
  name text,
  name_kana text,
  print_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_input as materialized (
    select
      public.normalize_card_search(coalesce(p_query, '')) as normalized_query,
      pg_catalog.btrim(coalesce(p_query, '')) as raw_query,
      case when p_mode = 'precise' then 0.90::real else 0.60::real end as threshold
  ),
  short_term_match_rows as materialized (
    select
      terms.canonical_card_id,
      terms.normalized_term = input.normalized_query as is_exact,
      true as is_prefix,
      false as is_contains,
      0::real as match_score
    from public.card_search_terms as terms
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) between 1 and 2
      and terms.normalized_term like input.normalized_query || '%'
  ),
  long_term_match_rows as materialized (
    select
      terms.canonical_card_id,
      terms.normalized_term = input.normalized_query as is_exact,
      true as is_prefix,
      false as is_contains,
      extensions.similarity(terms.normalized_term, input.normalized_query) as match_score
    from public.card_search_terms as terms
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) >= 3
      and terms.normalized_term like input.normalized_query || '%'

    union all

    select
      terms.canonical_card_id,
      false as is_exact,
      false as is_prefix,
      true as is_contains,
      extensions.similarity(terms.normalized_term, input.normalized_query) as match_score
    from public.card_search_terms as terms
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) >= 3
      and terms.normalized_term like '%' || input.normalized_query || '%'

    union all

    select
      terms.canonical_card_id,
      false as is_exact,
      false as is_prefix,
      false as is_contains,
      extensions.similarity(terms.normalized_term, input.normalized_query) as match_score
    from public.card_search_terms as terms
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) >= 3
      and terms.normalized_term operator(extensions.%) input.normalized_query
      and extensions.similarity(terms.normalized_term, input.normalized_query) >= input.threshold
  ),
  term_matches as materialized (
    select
      canonical_card_id,
      bool_or(is_exact) as is_exact,
      bool_or(is_prefix) as is_prefix,
      bool_or(is_contains) as is_contains,
      max(match_score) as match_score
    from (
      select * from short_term_match_rows
      union all
      select * from long_term_match_rows
    ) as match_rows
    group by canonical_card_id
  ),
  short_print_match_rows as materialized (
    select prints.canonical_card_id
    from public.card_prints as prints
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) between 1 and 2
      and prints.deleted_at is null
      and pg_catalog.lower(prints.card_number) like pg_catalog.lower(input.raw_query) || '%'

    union all

    select prints.canonical_card_id
    from public.card_prints as prints
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) between 1 and 2
      and prints.deleted_at is null
      and pg_catalog.lower(prints.product_name) like pg_catalog.lower(input.raw_query) || '%'
  ),
  long_print_match_rows as materialized (
    select prints.canonical_card_id
    from public.card_prints as prints
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) >= 3
      and input.raw_query <> ''
      and prints.deleted_at is null
      and prints.card_number ilike '%' || input.raw_query || '%'

    union all

    select prints.canonical_card_id
    from public.card_prints as prints
    cross join search_input as input
    where pg_catalog.char_length(input.normalized_query) >= 3
      and input.raw_query <> ''
      and prints.deleted_at is null
      and prints.product_name ilike '%' || input.raw_query || '%'
  ),
  print_matches as materialized (
    select distinct canonical_card_id
    from (
      select canonical_card_id from short_print_match_rows
      union all
      select canonical_card_id from long_print_match_rows
    ) as match_rows
  ),
  ranked_matches as materialized (
    select
      canonical_card_id,
      bool_or(is_exact) as is_exact,
      bool_or(is_prefix) as is_prefix,
      bool_or(is_contains) as is_contains,
      max(match_score) as match_score
    from (
      select
        canonical_card_id,
        is_exact,
        is_prefix,
        is_contains,
        match_score
      from term_matches

      union all

      select
        canonical_card_id,
        false as is_exact,
        false as is_prefix,
        false as is_contains,
        0::real as match_score
      from print_matches
    ) as candidate_rows
    group by canonical_card_id
  ),
  top_candidates as materialized (
    select
      canonical.id,
      games.slug as game_slug,
      games.name as game_name,
      canonical.name,
      canonical.name_kana,
      matches.is_exact,
      matches.is_prefix,
      matches.is_contains,
      matches.match_score
    from ranked_matches as matches
    join public.canonical_cards as canonical
      on canonical.id = matches.canonical_card_id
      and canonical.deleted_at is null
    join public.tcg_games as games on games.id = canonical.game_id
    where p_game_slug is null or games.slug = p_game_slug
    order by
      matches.is_exact desc,
      matches.is_prefix desc,
      matches.is_contains desc,
      matches.match_score desc,
      canonical.name
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select
    candidates.id,
    candidates.game_slug,
    candidates.game_name,
    candidates.name,
    candidates.name_kana,
    (
      select count(*)::integer
      from public.card_prints as prints
      where prints.canonical_card_id = candidates.id
        and prints.deleted_at is null
    ) as print_count
  from top_candidates as candidates
  order by
    candidates.is_exact desc,
    candidates.is_prefix desc,
    candidates.is_contains desc,
    candidates.match_score desc,
    candidates.name;
$$;

revoke all on function public.search_registration_cards(text, text, integer, text)
  from public;
grant execute on function public.search_registration_cards(text, text, integer, text)
  to anon, authenticated;
