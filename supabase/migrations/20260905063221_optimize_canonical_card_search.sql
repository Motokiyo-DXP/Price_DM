-- Search each source table once instead of aggregating it once per canonical card.
create or replace function public.search_canonical_cards(
  p_query text default '',
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
      public.normalize_card_search(p_query) as normalized_query,
      pg_catalog.btrim(p_query) as raw_query,
      case when p_mode = 'precise' then 0.90::real else 0.60::real end as threshold
  ),
  term_matches as materialized (
    select
      terms.canonical_card_id,
      max(extensions.similarity(terms.normalized_term, input.normalized_query)) as match_score,
      bool_or(terms.normalized_term = input.normalized_query) as is_exact,
      bool_or(terms.normalized_term like input.normalized_query || '%') as is_prefix,
      bool_or(terms.normalized_term like '%' || input.normalized_query || '%') as is_contains
    from public.card_search_terms as terms
    cross join search_input as input
    where input.normalized_query <> ''
      and (
        terms.normalized_term = input.normalized_query
        or terms.normalized_term like input.normalized_query || '%'
        or terms.normalized_term like '%' || input.normalized_query || '%'
        or extensions.similarity(terms.normalized_term, input.normalized_query) >= input.threshold
      )
    group by terms.canonical_card_id
  ),
  print_matches as materialized (
    select distinct prints.canonical_card_id
    from public.card_prints as prints
    cross join search_input as input
    where input.raw_query <> ''
      and prints.deleted_at is null
      and (
        prints.card_number ilike '%' || input.raw_query || '%'
        or prints.product_name ilike '%' || input.raw_query || '%'
      )
  ),
  candidate_ids as (
    select canonical.id as canonical_card_id
    from public.canonical_cards as canonical
    cross join search_input as input
    where canonical.deleted_at is null
      and input.normalized_query = ''
    union
    select canonical_card_id from term_matches
    union
    select canonical_card_id from print_matches
  )
  select
    canonical.id,
    games.slug as game_slug,
    games.name as game_name,
    canonical.name,
    canonical.name_kana,
    coalesce((
      select count(*)::integer
      from public.card_prints as prints
      where prints.canonical_card_id = canonical.id
        and prints.deleted_at is null
    ), 0)::integer as print_count
  from candidate_ids as candidates
  join public.canonical_cards as canonical
    on canonical.id = candidates.canonical_card_id
    and canonical.deleted_at is null
  join public.tcg_games as games on games.id = canonical.game_id
  left join term_matches as matches on matches.canonical_card_id = canonical.id
  where p_game_slug is null or games.slug = p_game_slug
  order by
    coalesce(matches.is_exact, false) desc,
    coalesce(matches.is_prefix, false) desc,
    coalesce(matches.is_contains, false) desc,
    coalesce(matches.match_score, 0::real) desc,
    canonical.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.search_canonical_cards(text, text, integer, text)
  from public;
grant execute on function public.search_canonical_cards(text, text, integer, text)
  to anon, authenticated;
