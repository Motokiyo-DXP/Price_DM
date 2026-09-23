-- Keep the short-query wrapper unchanged. The private helper below searches
-- only active public print data and returns IDs, allowing these trigram indexes
-- to be used without evaluating non-leakproof LIKE predicates through RLS.
create index if not exists card_prints_card_number_search_trgm_active_idx
  on public.card_prints using gin (card_number_search extensions.gin_trgm_ops)
  where deleted_at is null and card_number_search is not null;

create index if not exists card_prints_product_name_search_trgm_active_idx
  on public.card_prints using gin (product_name_search extensions.gin_trgm_ops)
  where deleted_at is null and product_name_search is not null;

-- PostgreSQL cannot push LIKE through the card_prints RLS barrier because
-- textlike is not leakproof. Keep the bypass limited to this private helper:
-- it explicitly filters active public prints and returns candidate IDs only.
create or replace function private.registration_card_print_candidates(
  p_normalized_query text,
  p_raw_query text
)
returns table(canonical_card_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query execute $print_search$
    select distinct match_rows.canonical_card_id
    from (
      select prints.canonical_card_id
      from public.card_prints as prints
      where pg_catalog.char_length($1) between 1 and 2
        and $2 <> ''
        and prints.deleted_at is null
        and prints.card_number_search operator(pg_catalog.~~)
          (pg_catalog.lower($2) || '%')

      union all

      select prints.canonical_card_id
      from public.card_prints as prints
      where pg_catalog.char_length($1) between 1 and 2
        and $2 <> ''
        and prints.deleted_at is null
        and prints.product_name_search operator(pg_catalog.~~)
          (pg_catalog.lower($2) || '%')

      union all

      select prints.canonical_card_id
      from public.card_prints as prints
      where pg_catalog.char_length($2) >= 3
        and $2 <> ''
        and prints.deleted_at is null
        and prints.card_number_search operator(pg_catalog.~~)
          ('%' || pg_catalog.lower($2) || '%')

      union all

      select prints.canonical_card_id
      from public.card_prints as prints
      where pg_catalog.char_length($2) >= 3
        and $2 <> ''
        and prints.deleted_at is null
        and prints.product_name_search operator(pg_catalog.~~)
          ('%' || pg_catalog.lower($2) || '%')
    ) as match_rows
  $print_search$
  using p_normalized_query, p_raw_query;
end;
$$;

revoke all on function private.registration_card_print_candidates(text, text)
  from public;
grant execute on function private.registration_card_print_candidates(text, text)
  to anon, authenticated;

-- The parameters are bound with EXECUTE ... USING so PostgreSQL plans the
-- prefix and trigram predicates with the actual query, while keeping values out
-- of the SQL text. Candidate IDs are then resolved through canonical_cards' PK.
create or replace function public.search_registration_cards_long(
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
  v_normalized_query text := public.normalize_card_search(coalesce(p_query, ''));
  v_raw_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_threshold real := case when p_mode = 'precise' then 0.90::real else 0.60::real end;
  v_result_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  -- An empty normalized query historically lists cards alphabetically.
  if v_normalized_query = '' then
    return query
      select
        canonical.id,
        game.slug as game_slug,
        game.name as game_name,
        canonical.name,
        canonical.name_kana,
        (
          select count(*)::integer
          from public.card_prints as prints
          where prints.canonical_card_id = canonical.id
            and prints.deleted_at is null
        ) as print_count
      from public.canonical_cards as canonical
      join public.tcg_games as game on game.id = canonical.game_id
      where canonical.deleted_at is null
        and (p_game_slug is null or game.slug = p_game_slug)
      order by canonical.name
      limit v_result_limit;
    return;
  end if;

  return query execute $long_search$
    with term_match_rows as materialized (
      -- Exact matches are included in the prefix range and retain their
      -- highest ranking flag. Short normalized terms keep the legacy zero score.
      select
        terms.canonical_card_id,
        terms.normalized_term = $1 as is_exact,
        true as is_prefix,
        false as is_contains,
        case when pg_catalog.char_length($1) >= 3
          then extensions.similarity(terms.normalized_term, $1)
          else 0::real
        end as match_score
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ($1 || '%')

      union all

      select
        terms.canonical_card_id,
        false as is_exact,
        false as is_prefix,
        true as is_contains,
        extensions.similarity(terms.normalized_term, $1) as match_score
      from public.card_search_terms as terms
      where pg_catalog.char_length($1) >= 3
        and terms.normalized_term operator(pg_catalog.~~) ('%' || $1 || '%')

      union all

      select
        terms.canonical_card_id,
        false as is_exact,
        false as is_prefix,
        false as is_contains,
        extensions.similarity(terms.normalized_term, $1) as match_score
      from public.card_search_terms as terms
      where pg_catalog.char_length($1) >= 3
        and terms.normalized_term operator(extensions.%) $1
        and extensions.similarity(terms.normalized_term, $1) >= $3
    ),
    print_matches as materialized (
      select distinct candidates.canonical_card_id
      from private.registration_card_print_candidates($1, $2) as candidates
    ),
    ranked_matches as materialized (
      select
        candidate_rows.canonical_card_id,
        bool_or(candidate_rows.is_exact) as is_exact,
        bool_or(candidate_rows.is_prefix) as is_prefix,
        bool_or(candidate_rows.is_contains) as is_contains,
        max(candidate_rows.match_score) as match_score
      from (
        select
          terms.canonical_card_id,
          terms.is_exact,
          terms.is_prefix,
          terms.is_contains,
          terms.match_score
        from term_match_rows as terms

        union all

        select
          prints.canonical_card_id,
          false as is_exact,
          false as is_prefix,
          false as is_contains,
          0::real as match_score
        from print_matches as prints
      ) as candidate_rows
      group by candidate_rows.canonical_card_id
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
      where $4 is null or game.slug = $4
      order by
        matches.is_exact desc,
        matches.is_prefix desc,
        matches.is_contains desc,
        matches.match_score desc,
        canonical.name
      limit $5
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
      candidates.name
  $long_search$
  using v_normalized_query, v_raw_query, v_threshold, p_game_slug, v_result_limit;
end;
$$;

-- Keep the long implementation internal; the supported Data API entry point is
-- public.search_registration_cards. The invoker wrapper still needs EXECUTE
-- on this function, while PostgREST does not expose the private schema.
alter function public.search_registration_cards_long(text, text, integer, text)
  set schema private;
revoke all on function private.search_registration_cards_long(text, text, integer, text)
  from public;
grant execute on function private.search_registration_cards_long(text, text, integer, text)
  to anon, authenticated;

-- Keep the existing short-query implementation unchanged and route only the
-- long-query branch through the internal helper.
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
    from private.search_registration_cards_long(p_query, p_game_slug, p_limit, p_mode);
end;
$$;

revoke all on function public.search_registration_cards(text, text, integer, text)
  from public;
grant execute on function public.search_registration_cards(text, text, integer, text)
  to anon, authenticated;
