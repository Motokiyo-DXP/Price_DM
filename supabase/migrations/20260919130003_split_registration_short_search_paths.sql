-- Keep the interactive 1-2 character registration search out of the
-- long contains/fuzzy query. RLS cannot push lower(column) LIKE through the
-- public-read policy, so expose stored lower-case values for leakproof ranges.
alter table public.card_prints
  add column card_number_search text generated always as (pg_catalog.lower(card_number)) stored,
  add column product_name_search text generated always as (pg_catalog.lower(product_name)) stored;

create index card_prints_card_number_search_prefix_active_idx
  on public.card_prints (card_number_search text_pattern_ops)
  where deleted_at is null and card_number_search is not null;

create index card_prints_product_name_search_prefix_active_idx
  on public.card_prints (product_name_search text_pattern_ops)
  where deleted_at is null and product_name_search is not null;

create index card_prints_canonical_card_id_active_idx
  on public.card_prints (canonical_card_id)
  where deleted_at is null;

-- Preserve the deployed 3+ character implementation unchanged. The new
-- wrapper below routes only short input to a separate, indexable query.
alter function public.search_registration_cards(text, text, integer, text)
  rename to search_registration_cards_long;

create or replace function public.search_registration_cards(
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
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := public.normalize_card_search(coalesce(p_query, ''));
  raw_query text := pg_catalog.btrim(coalesce(p_query, ''));
  ascii_prefix text;
  ascii_prefix_upper text;
  is_ascii_short boolean;
  result_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  -- Use the raw length for branch selection so a card number such as RP3
  -- remains on the existing 3+ character contains path even if normalization
  -- removes one of its characters for term matching.
  if pg_catalog.char_length(raw_query) between 1 and 2
    and normalized_query <> '' then
    is_ascii_short := raw_query ~ '^[0-9A-Za-z]{1,2}$';
    if is_ascii_short then
      ascii_prefix := pg_catalog.lower(raw_query);
      ascii_prefix_upper := pg_catalog.left(ascii_prefix, pg_catalog.char_length(ascii_prefix) - 1)
        || pg_catalog.chr(pg_catalog.ascii(pg_catalog.right(ascii_prefix, 1)) + 1);
    end if;

    return query
      with term_matches as materialized (
        select
          terms.canonical_card_id,
          bool_or(terms.normalized_term = normalized_query) as is_exact,
          true as is_prefix,
          false as is_contains,
          0::real as match_score
        from public.card_search_terms as terms
        where terms.normalized_term like normalized_query || '%'
        group by terms.canonical_card_id
      ),
      print_matches as materialized (
        select prints.canonical_card_id
        from public.card_prints as prints
        where is_ascii_short
          and prints.deleted_at is null
          and (
            (
              prints.card_number_search operator(pg_catalog.~>=~) ascii_prefix
              and prints.card_number_search operator(pg_catalog.~<~) ascii_prefix_upper
            )
            or (
              prints.product_name_search operator(pg_catalog.~>=~) ascii_prefix
              and prints.product_name_search operator(pg_catalog.~<~) ascii_prefix_upper
            )
          )
      ),
      ranked_matches as materialized (
        select
          match_rows.canonical_card_id,
          bool_or(match_rows.is_exact) as is_exact,
          bool_or(match_rows.is_prefix) as is_prefix,
          bool_or(match_rows.is_contains) as is_contains,
          max(match_rows.match_score) as match_score
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
        ) as match_rows
        group by match_rows.canonical_card_id
      ),
      top_candidates as materialized (
        select
          canonical.id,
          game.slug as game_slug,
          game.name as game_name,
          canonical.name,
          canonical.name_kana,
          matches.is_exact,
          matches.is_prefix,
          matches.is_contains,
          matches.match_score
        from ranked_matches as matches
        cross join lateral (
          select cards.id, cards.game_id, cards.name, cards.name_kana
          from public.canonical_cards as cards
          where cards.id = matches.canonical_card_id
            and cards.deleted_at is null
          offset 0
        ) as canonical
        join public.tcg_games as game on game.id = canonical.game_id
        where p_game_slug is null or game.slug = p_game_slug
        order by
          matches.is_exact desc,
          matches.is_prefix desc,
          matches.is_contains desc,
          matches.match_score desc,
          canonical.name
        limit result_limit
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
    return;
  end if;

  return query
    select *
    from public.search_registration_cards_long(p_query, p_game_slug, p_limit, p_mode);
end;
$$;

revoke all on function public.search_registration_cards(text, text, integer, text)
  from public;
grant execute on function public.search_registration_cards(text, text, integer, text)
  to anon, authenticated;
