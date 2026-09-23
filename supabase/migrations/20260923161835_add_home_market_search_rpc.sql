-- A dedicated home search avoids the shared search RPC's broad short-query
-- predicates. The existing prefix/trigram and generated print indexes are
-- reused; this migration deliberately adds no indexes.
create or replace function private.market_card_print_candidates(
  p_normalized_query text,
  p_raw_query text,
  p_prefix_upper text default null
)
returns table(canonical_card_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(p_raw_query, '') = '' then
    return;
  end if;

  if pg_catalog.char_length(p_normalized_query) between 1 and 2 then
    return query execute $short_print_search$
      select prints.canonical_card_id
      from public.card_prints as prints
      where prints.deleted_at is null
        and prints.card_number_search operator(pg_catalog.~>=~) pg_catalog.lower($1)
        and (
          ($2 is not null and prints.card_number_search operator(pg_catalog.~<~) $2)
          or ($2 is null and prints.card_number_search operator(pg_catalog.~~) (pg_catalog.lower($1) || '%'))
        )

      union

      select prints.canonical_card_id
      from public.card_prints as prints
      where prints.deleted_at is null
        and prints.product_name_search operator(pg_catalog.~>=~) pg_catalog.lower($1)
        and (
          ($2 is not null and prints.product_name_search operator(pg_catalog.~<~) $2)
          or ($2 is null and prints.product_name_search operator(pg_catalog.~~) (pg_catalog.lower($1) || '%'))
        )
    $short_print_search$
    using p_raw_query, p_prefix_upper;
    return;
  end if;

  return query execute $long_print_search$
    select prints.canonical_card_id
    from public.card_prints as prints
    where prints.deleted_at is null
      and prints.card_number_search operator(pg_catalog.~~) ('%' || pg_catalog.lower($1) || '%')

    union

    select prints.canonical_card_id
    from public.card_prints as prints
    where prints.deleted_at is null
      and prints.product_name_search operator(pg_catalog.~~) ('%' || pg_catalog.lower($1) || '%')
  $long_print_search$
  using p_raw_query;
end;
$$;

revoke all on function private.market_card_print_candidates(text, text, text)
  from public;
grant execute on function private.market_card_print_candidates(text, text, text)
  to anon, authenticated;

-- Keep the fuzzy cutoff in the query predicate: the hosted migration role
-- lacks permission for this extension setting.
create or replace function public.search_market_cards(
  p_query text,
  p_game_slug text default 'duel-masters',
  p_limit integer default 100,
  p_mode text default 'broad'
)
returns table(
  id bigint,
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
  normalized_prefix_upper text;
  print_prefix_upper text;
  last_codepoint integer;
  result_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  threshold real := case when p_mode = 'precise' then 0.90::real else 0.60::real end;
begin
  if normalized_query = '' then
    return;
  end if;

  if pg_catalog.char_length(normalized_query) between 1 and 2 then
    last_codepoint := pg_catalog.ascii(pg_catalog.right(normalized_query, 1));
    if last_codepoint < 1114111 then
      normalized_prefix_upper := pg_catalog.left(normalized_query, pg_catalog.char_length(normalized_query) - 1)
        || pg_catalog.chr(case when last_codepoint = 55295 then 57344 else last_codepoint + 1 end);
    end if;
    last_codepoint := pg_catalog.ascii(pg_catalog.right(pg_catalog.lower(raw_query), 1));
    if last_codepoint < 1114111 then
      print_prefix_upper := pg_catalog.left(pg_catalog.lower(raw_query), pg_catalog.char_length(pg_catalog.lower(raw_query)) - 1)
        || pg_catalog.chr(case when last_codepoint = 55295 then 57344 else last_codepoint + 1 end);
    end if;

    -- Short input is prefix-only. Each branch is a separate statement so a
    -- short Japanese query cannot plan or execute the contains/fuzzy path.
    return query execute $short_search$
      with term_matches as materialized (
        select
          terms.canonical_card_id,
          bool_or(terms.normalized_term = $1) as is_exact,
          true as is_prefix,
          true as is_contains,
          max(extensions.similarity(terms.normalized_term, $1)) as match_score
        from public.card_search_terms as terms
        where terms.normalized_term operator(pg_catalog.~>=~) $1
          and (
            ($2 is not null and terms.normalized_term operator(pg_catalog.~<~) $2)
            or ($2 is null and terms.normalized_term operator(pg_catalog.~~) ($1 || '%'))
          )
        group by terms.canonical_card_id
      ),
      print_matches as materialized (
        select prints.canonical_card_id
        from private.market_card_print_candidates($1, $3, $4) as prints
      ),
      ranked_matches as materialized (
        select
          rows.canonical_card_id,
          bool_or(rows.is_exact) as is_exact,
          bool_or(rows.is_prefix) as is_prefix,
          bool_or(rows.is_contains) as is_contains,
          max(rows.match_score) as match_score
        from (
          select canonical_card_id, is_exact, is_prefix, is_contains, match_score
          from term_matches
          union all
          select canonical_card_id, false, false, false, 0::real
          from print_matches
        ) as rows
        group by rows.canonical_card_id
      ),
      top_candidates as materialized (
        select
          cards.id,
          games.name as game_name,
          cards.name,
          cards.name_kana,
          matches.is_exact,
          matches.is_prefix,
          matches.is_contains,
          matches.match_score
        from ranked_matches as matches
        join public.canonical_cards as cards
          on cards.id = matches.canonical_card_id
          and cards.deleted_at is null
        join public.tcg_games as games on games.id = cards.game_id
        where $5 is null or games.slug = $5
        order by matches.is_exact desc, matches.is_prefix desc,
          matches.is_contains desc, matches.match_score desc, cards.name
        limit $6
      )
      select
        candidates.id,
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
      order by candidates.is_exact desc, candidates.is_prefix desc,
        candidates.is_contains desc, candidates.match_score desc, candidates.name
    $short_search$
    using normalized_query, normalized_prefix_upper, raw_query, print_prefix_upper, p_game_slug, result_limit;
    return;
  end if;

  return query execute $long_search$
    with term_match_rows as materialized (
      select
        terms.canonical_card_id,
        terms.normalized_term = $1 as is_exact,
        true as is_prefix,
        true as is_contains,
        extensions.similarity(terms.normalized_term, $1) as match_score
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ($1 || '%')

      union all

      select
        terms.canonical_card_id,
        false,
        false,
        true,
        extensions.similarity(terms.normalized_term, $1)
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ('%' || $1 || '%')

      union all

      select
        terms.canonical_card_id,
        false,
        false,
        false,
        extensions.similarity(terms.normalized_term, $1)
      from public.card_search_terms as terms
      where terms.normalized_term operator(extensions.%) $1
        and extensions.similarity(terms.normalized_term, $1) >= $5
    ),
    print_matches as materialized (
      select prints.canonical_card_id
      from private.market_card_print_candidates($1, $2, null) as prints
    ),
    ranked_matches as materialized (
      select
        rows.canonical_card_id,
        bool_or(rows.is_exact) as is_exact,
        bool_or(rows.is_prefix) as is_prefix,
        bool_or(rows.is_contains) as is_contains,
        max(rows.match_score) as match_score
      from (
        select canonical_card_id, is_exact, is_prefix, is_contains, match_score
        from term_match_rows
        union all
        select canonical_card_id, false, false, false, 0::real
        from print_matches
      ) as rows
      group by rows.canonical_card_id
    ),
    top_candidates as materialized (
      select
        cards.id,
        games.name as game_name,
        cards.name,
        cards.name_kana,
        matches.is_exact,
        matches.is_prefix,
        matches.is_contains,
        matches.match_score
      from ranked_matches as matches
      join public.canonical_cards as cards
        on cards.id = matches.canonical_card_id
        and cards.deleted_at is null
      join public.tcg_games as games on games.id = cards.game_id
      where $3 is null or games.slug = $3
      order by matches.is_exact desc, matches.is_prefix desc,
        matches.is_contains desc, matches.match_score desc, cards.name
      limit $4
    )
    select
      candidates.id,
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
    order by candidates.is_exact desc, candidates.is_prefix desc,
      candidates.is_contains desc, candidates.match_score desc, candidates.name
  $long_search$
  using normalized_query, raw_query, p_game_slug, result_limit, threshold;
end;
$$;

revoke all on function public.search_market_cards(text, text, integer, text)
  from public;
grant execute on function public.search_market_cards(text, text, integer, text)
  to anon, authenticated;
