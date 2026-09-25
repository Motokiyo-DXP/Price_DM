-- Keep short-query matching covered by the prefix index so PostgreSQL can
-- return candidate IDs without fetching every matching search-term heap row.
drop index if exists public.card_search_terms_normalized_prefix_idx;
create index card_search_terms_normalized_prefix_idx
  on public.card_search_terms using btree (normalized_term text_pattern_ops)
  include (canonical_card_id);

-- Keep one- and two-character deck name searches on the existing prefix
-- index. The longer path retains contains and trigram matching.
create function private.search_deck_card_term_matches(
  p_normalized_query text,
  p_include_relevance_score boolean default false
)
returns table(
  canonical_card_id bigint,
  is_exact boolean,
  is_prefix boolean,
  is_contains boolean,
  match_tier smallint,
  match_score real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prefix_upper text;
  last_codepoint integer;
begin
  if coalesce(p_normalized_query, '') = '' then
    return;
  end if;

  if pg_catalog.char_length(p_normalized_query) <= 2 then
    last_codepoint := pg_catalog.ascii(pg_catalog.right(p_normalized_query, 1));
    if last_codepoint < 1114111 then
      prefix_upper := pg_catalog.left(
        p_normalized_query,
        pg_catalog.char_length(p_normalized_query) - 1
      ) || pg_catalog.chr(
        case when last_codepoint = 55295 then 57344 else last_codepoint + 1 end
      );
    end if;

    -- Dynamic SQL keeps the contains and trigram predicates out of the
    -- short-query plan. The range matches the text_pattern_ops index.
    return query execute $short_terms$
      select
        terms.canonical_card_id,
        pg_catalog.bool_or(terms.normalized_term = $1) as is_exact,
        true as is_prefix,
        true as is_contains,
        pg_catalog.min(
          case
            when terms.normalized_term = $1 then 0
            when pg_catalog.char_length($1) = 1 then 1
            when terms.term_kind in ('official_name', 'face_name') then 1
            else 2
          end
        )::smallint as match_tier,
        pg_catalog.max(
          case when $3
            then extensions.similarity(terms.normalized_term, $1)
            else 0::real
          end
        ) as match_score
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~>=~) $1
        and (
          ($2 is not null and terms.normalized_term operator(pg_catalog.~<~) $2)
          or ($2 is null and terms.normalized_term operator(pg_catalog.~~) ($1 || '%'))
        )
      group by terms.canonical_card_id
    $short_terms$
    using p_normalized_query, prefix_upper, p_include_relevance_score;
    return;
  end if;

  return query execute $long_terms$
    with term_rows as materialized (
      select
        terms.canonical_card_id,
        terms.normalized_term = $1 as is_exact,
        true as is_prefix,
        true as is_contains,
        case
          when terms.normalized_term = $1 then 0
          when pg_catalog.char_length($1) = 1 then 1
          when terms.term_kind in ('official_name', 'face_name') then 1
          else 2
        end::smallint as match_tier,
        extensions.similarity(terms.normalized_term, $1) as match_score
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ($1 || '%')

      union all

      select
        terms.canonical_card_id,
        false,
        false,
        true,
        3::smallint,
        extensions.similarity(terms.normalized_term, $1)
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ('%' || $1 || '%')

      union all

      select
        terms.canonical_card_id,
        false,
        false,
        false,
        4::smallint,
        extensions.similarity(terms.normalized_term, $1)
      from public.card_search_terms as terms
      where terms.normalized_term operator(extensions.%) $1
        and extensions.similarity(terms.normalized_term, $1) >= 0.60
    ), best_tiers as materialized (
      select term_rows.canonical_card_id, pg_catalog.min(term_rows.match_tier)::smallint as match_tier
      from term_rows
      group by term_rows.canonical_card_id
    )
    select
      best_tiers.canonical_card_id,
      pg_catalog.bool_or(term_rows.is_exact),
      pg_catalog.bool_or(term_rows.is_prefix),
      pg_catalog.bool_or(term_rows.is_contains),
      best_tiers.match_tier,
      pg_catalog.max(term_rows.match_score)
    from best_tiers
    join term_rows on term_rows.canonical_card_id = best_tiers.canonical_card_id
      and term_rows.match_tier = best_tiers.match_tier
    group by best_tiers.canonical_card_id, best_tiers.match_tier
  $long_terms$
  using p_normalized_query;
end;
$$;

revoke all on function private.search_deck_card_term_matches(text, boolean)
  from public, anon;
grant execute on function private.search_deck_card_term_matches(text, boolean)
  to authenticated;

-- Filter candidate IDs before usage and release-date aggregation. Print counts
-- and the representative image are looked up only for the returned page.
create function private.search_deck_cards_filtered_fast_impl(
  p_query text default '',
  p_limit integer default 30,
  p_offset integer default 0,
  p_sort text default 'usage',
  p_ascending boolean default false,
  p_product_name text default null,
  p_card_number text default null,
  p_civilizations text[] default '{}'::text[],
  p_civilization_mode text default 'cup',
  p_color text default 'all',
  p_card_types text[] default '{}'::text[],
  p_min_cost integer default null,
  p_max_cost integer default null,
  p_no_cost boolean default false,
  p_image text default 'all'
)
returns table(
  id bigint,
  name text,
  name_kana text,
  print_count integer,
  usage_count bigint,
  representative_print_id bigint,
  image_key text,
  cost integer,
  civilizations text[],
  card_types text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := public.normalize_card_search(coalesce(p_query, ''));
  raw_query text := pg_catalog.btrim(coalesce(p_query, ''));
  print_prefix_upper text;
  last_codepoint integer;
  result_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  result_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  last_codepoint := pg_catalog.ascii(pg_catalog.right(pg_catalog.lower(raw_query), 1));
  if raw_query <> '' and last_codepoint < 1114111 then
    print_prefix_upper := pg_catalog.left(
      pg_catalog.lower(raw_query),
      pg_catalog.char_length(pg_catalog.lower(raw_query)) - 1
    ) || pg_catalog.chr(
      case when last_codepoint = 55295 then 57344 else last_codepoint + 1 end
    );
  end if;

  return query
    with search_input as materialized (
      select normalized_query as term, raw_query as raw
    ),
    term_matches as materialized (
      select *
      from private.search_deck_card_term_matches(
        normalized_query,
        p_sort = 'relevance'
      )
    ),
    print_matches as materialized (
      select distinct candidates.canonical_card_id
      from search_input as input
      cross join lateral private.market_card_print_candidates(
        input.term,
        input.raw,
        print_prefix_upper
      ) as candidates
      where input.term <> ''
    ),
    candidate_ids as materialized (
      select matches.canonical_card_id from term_matches as matches
      union
      select matches.canonical_card_id from print_matches as matches
      union
      select cards.id
      from public.canonical_cards as cards
      join public.tcg_games as games on games.id = cards.game_id
      cross join search_input as input
      where input.term = ''
        and games.slug = 'duel-masters'
        and cards.deleted_at is null
    ),
    filtered_candidates as materialized (
      select
        cards.id,
        cards.name,
        cards.name_kana,
        cards.cost,
        cards.civilizations,
        cards.card_types,
        coalesce(matches.is_exact, false) as is_exact,
        coalesce(matches.is_prefix, false) as is_prefix,
        coalesce(matches.is_contains, false) as is_contains,
        coalesce(matches.match_tier, 5::smallint) as match_tier,
        coalesce(matches.match_score, 0::real) as match_score
      from candidate_ids as candidates
      join public.canonical_cards as cards
        on cards.id = candidates.canonical_card_id
        and cards.deleted_at is null
      join public.tcg_games as games
        on games.id = cards.game_id
        and games.slug = 'duel-masters'
      left join term_matches as matches
        on matches.canonical_card_id = cards.id
      where
        (nullif(p_product_name, '') is null or exists (
          select 1
          from public.card_prints as prints
          where prints.canonical_card_id = cards.id
            and prints.deleted_at is null
            and prints.product_name = p_product_name
        ))
        and (nullif(pg_catalog.btrim(p_card_number), '') is null or exists (
          select 1
          from public.card_prints as prints
          where prints.canonical_card_id = cards.id
            and prints.deleted_at is null
            and prints.card_number operator(pg_catalog.~~)
              ('%' || pg_catalog.btrim(p_card_number) || '%')
        ))
        and (
          pg_catalog.cardinality(p_civilizations) = 0
          or (p_civilization_mode = 'cap' and cards.civilizations @> p_civilizations)
          or (p_civilization_mode <> 'cap' and cards.civilizations && p_civilizations)
        )
        and (
          p_color = 'all'
          or (p_color = 'single' and pg_catalog.cardinality(cards.civilizations) = 1)
          or (p_color = 'multi' and pg_catalog.cardinality(cards.civilizations) > 1)
        )
        and (
          pg_catalog.cardinality(p_card_types) = 0
          or cards.card_types && p_card_types
        )
        and (
          (p_min_cost is null and p_max_cost is null)
          or (cards.cost is null and p_no_cost)
          or (
            (p_min_cost is not null or p_max_cost is not null)
            and cards.cost is not null
            and (p_min_cost is null or cards.cost >= p_min_cost)
            and (p_max_cost is null or cards.cost <= p_max_cost)
          )
        )
        and (
          p_image = 'all'
          or (p_image = 'with' and exists (
            select 1
            from public.card_prints as prints
            where prints.canonical_card_id = cards.id
              and prints.deleted_at is null
              and prints.image_key is not null
          ))
          or (p_image = 'without' and not exists (
            select 1
            from public.card_prints as prints
            where prints.canonical_card_id = cards.id
              and prints.deleted_at is null
              and prints.image_key is not null
          ))
        )
    ),
    usage as materialized (
      select
        deck_cards.canonical_card_id,
        pg_catalog.sum(deck_cards.quantity)::bigint as total
      from filtered_candidates as candidates
      join public.deck_cards as deck_cards
        on deck_cards.canonical_card_id = candidates.id
      join public.decks as decks on decks.id = deck_cards.deck_id
      group by deck_cards.canonical_card_id
    ),
    ranked_candidates as materialized (
      select
        candidates.*,
        coalesce(usage.total, 0::bigint) as total,
        case when p_sort = 'release_date' then (
          select pg_catalog.min(products.release_date)
          from public.card_prints as prints
          join public.card_products as products on products.id = prints.product_id
          where prints.canonical_card_id = candidates.id
            and prints.deleted_at is null
            and products.release_date is not null
        ) else null::date end as first_release_date
      from filtered_candidates as candidates
      left join usage on usage.canonical_card_id = candidates.id
    ),
    page_candidates as materialized (
      select *
      from ranked_candidates as candidates
      order by
        case when p_sort = 'relevance' and normalized_query = '' then candidates.total end desc,
        case when p_sort = 'relevance' and normalized_query = '' then candidates.name end asc,
        case when p_sort = 'relevance' and normalized_query <> '' and p_ascending then candidates.match_tier end asc,
        case when p_sort = 'relevance' and normalized_query <> '' and p_ascending then candidates.match_score end desc,
        case when p_sort = 'relevance' and normalized_query <> '' and p_ascending then candidates.total end desc,
        case when p_sort = 'relevance' and normalized_query <> '' and not p_ascending then candidates.match_tier end desc,
        case when p_sort = 'relevance' and normalized_query <> '' and not p_ascending then candidates.match_score end asc,
        case when p_sort = 'relevance' and normalized_query <> '' and not p_ascending then candidates.total end asc,
        case when p_sort = 'name' and p_ascending then candidates.name end asc,
        case when p_sort = 'name' and not p_ascending then candidates.name end desc,
        case when p_sort = 'release_date' then candidates.first_release_date is null end asc,
        case when p_sort = 'release_date' and p_ascending then candidates.first_release_date end asc,
        case when p_sort = 'release_date' and not p_ascending then candidates.first_release_date end desc,
        case when p_sort = 'usage' and p_ascending then candidates.total end asc,
        case when p_sort = 'usage' and not p_ascending then candidates.total end desc,
        case when p_sort = 'relevance' and normalized_query <> '' and p_ascending then candidates.name end asc,
        case when p_sort = 'relevance' and normalized_query <> '' and p_ascending then candidates.id end asc,
        case when p_sort = 'relevance' and normalized_query <> '' and not p_ascending then candidates.name end desc,
        case when p_sort = 'relevance' and normalized_query <> '' and not p_ascending then candidates.id end desc,
        case when p_sort <> 'relevance' then candidates.name end asc,
        case when p_sort <> 'relevance' then candidates.id end asc
      limit result_limit
      offset result_offset
    )
    select
      candidates.id,
      candidates.name,
      candidates.name_kana,
      (
        select pg_catalog.count(*)::integer
        from public.card_prints as prints
        where prints.canonical_card_id = candidates.id
          and prints.deleted_at is null
      ) as print_count,
      candidates.total as usage_count,
      representative.print_id as representative_print_id,
      representative.image_key,
      candidates.cost::integer,
      candidates.civilizations,
      candidates.card_types
    from page_candidates as candidates
    left join lateral (
      select prints.id as print_id, prints.image_key
      from public.card_prints as prints
      where prints.canonical_card_id = candidates.id
        and prints.deleted_at is null
        and prints.image_key is not null
      order by prints.id
      limit 1
    ) as representative on true;
end;
$$;

revoke all on function private.search_deck_cards_filtered_fast_impl(
  text,integer,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
) from public, anon;
grant execute on function private.search_deck_cards_filtered_fast_impl(
  text,integer,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
) to authenticated;

drop function if exists public.search_deck_cards_filtered(
  text,integer,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
);
create function public.search_deck_cards_filtered(
  p_query text default '',
  p_limit integer default 30,
  p_offset integer default 0,
  p_sort text default 'usage',
  p_ascending boolean default false,
  p_product_name text default null,
  p_card_number text default null,
  p_civilizations text[] default '{}'::text[],
  p_civilization_mode text default 'cup',
  p_color text default 'all',
  p_card_types text[] default '{}'::text[],
  p_min_cost integer default null,
  p_max_cost integer default null,
  p_no_cost boolean default false,
  p_image text default 'all'
)
returns table(
  id bigint,
  name text,
  name_kana text,
  print_count integer,
  usage_count bigint,
  representative_print_id bigint,
  image_key text,
  cost integer,
  civilizations text[],
  card_types text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.search_deck_cards_filtered_fast_impl(
    p_query,
    p_limit,
    p_offset,
    p_sort,
    p_ascending,
    p_product_name,
    p_card_number,
    p_civilizations,
    p_civilization_mode,
    p_color,
    p_card_types,
    p_min_cost,
    p_max_cost,
    p_no_cost,
    p_image
  );
$$;

revoke all on function public.search_deck_cards_filtered(
  text,integer,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
) from public, anon;
grant execute on function public.search_deck_cards_filtered(
  text,integer,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
) to authenticated;

-- The market search previously returned names first and the client then made
-- a separate card_prints request. Return the same oldest active image directly.
drop function if exists public.search_market_cards(text, text, integer, text);
create function public.search_market_cards(
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
  print_count integer,
  image_key text
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

    return query execute $short_search$
      with term_match_rows as materialized (
        select
          terms.canonical_card_id,
          case
            when terms.normalized_term = $1 then 0
            when pg_catalog.char_length($1) = 1 then 1
            when terms.term_kind in ('official_name', 'face_name') then 1
            else 2
          end::smallint as match_tier,
          extensions.similarity(terms.normalized_term, $1) as match_score
        from public.card_search_terms as terms
        where terms.normalized_term operator(pg_catalog.~>=~) $1
          and (
          ($2 is not null and terms.normalized_term operator(pg_catalog.~<~) $2)
          or ($2 is null and terms.normalized_term operator(pg_catalog.~~) ($1 || '%'))
        )
      ),
      print_matches as materialized (
        select prints.canonical_card_id
        from private.market_card_print_candidates($1, $3, $4) as prints
      ),
      all_match_rows as materialized (
        select canonical_card_id, match_tier, match_score from term_match_rows
        union all
        select canonical_card_id, 5::smallint, 0::real from print_matches
      ),
      best_tiers as materialized (
        select canonical_card_id, pg_catalog.min(match_tier)::smallint as match_tier
        from all_match_rows
        group by canonical_card_id
      ),
      ranked_matches as materialized (
        select
          best.canonical_card_id,
          best.match_tier,
          pg_catalog.max(rows.match_score) as match_score
        from best_tiers as best
        join all_match_rows as rows
          on rows.canonical_card_id = best.canonical_card_id
          and rows.match_tier = best.match_tier
        group by best.canonical_card_id, best.match_tier
      ),
      top_candidates as materialized (
        select
          cards.id,
          games.name as game_name,
          cards.name,
          cards.name_kana,
          matches.match_tier,
          matches.match_score
        from ranked_matches as matches
        join public.canonical_cards as cards
          on cards.id = matches.canonical_card_id
          and cards.deleted_at is null
        join public.tcg_games as games on games.id = cards.game_id
        where $5 is null or games.slug = $5
        order by matches.match_tier asc, matches.match_score desc, cards.name
        limit $6
      )
      select
        candidates.id,
        candidates.game_name,
        candidates.name,
        candidates.name_kana,
        (
          select pg_catalog.count(*)::integer
          from public.card_prints as prints
          where prints.canonical_card_id = candidates.id
            and prints.deleted_at is null
        ) as print_count,
        representative.image_key
      from top_candidates as candidates
      left join lateral (
        select prints.image_key
        from public.card_prints as prints
        where prints.canonical_card_id = candidates.id
          and prints.deleted_at is null
          and prints.image_key is not null
        order by prints.id
        limit 1
      ) as representative on true
      order by candidates.match_tier asc, candidates.match_score desc, candidates.name
    $short_search$
    using normalized_query, normalized_prefix_upper, raw_query, print_prefix_upper, p_game_slug, result_limit;
    return;
  end if;

  return query execute $long_search$
    with term_match_rows as materialized (
      select
        terms.canonical_card_id,
        case
          when terms.normalized_term = $1 then 0
          when pg_catalog.char_length($1) = 1 then 1
          when terms.term_kind in ('official_name', 'face_name') then 1
          else 2
        end::smallint as match_tier,
        extensions.similarity(terms.normalized_term, $1) as match_score
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ($1 || '%')

      union all

      select
        terms.canonical_card_id,
        3::smallint,
        extensions.similarity(terms.normalized_term, $1)
      from public.card_search_terms as terms
      where terms.normalized_term operator(pg_catalog.~~) ('%' || $1 || '%')

      union all

      select
        terms.canonical_card_id,
        4::smallint,
        extensions.similarity(terms.normalized_term, $1)
      from public.card_search_terms as terms
      where terms.normalized_term operator(extensions.%) $1
        and extensions.similarity(terms.normalized_term, $1) >= $5
    ),
    print_matches as materialized (
      select prints.canonical_card_id
      from private.market_card_print_candidates($1, $2, null) as prints
    ),
    all_match_rows as materialized (
      select
        canonical_card_id, match_tier, match_score
      from term_match_rows
      union all
      select canonical_card_id, 5::smallint, 0::real
      from print_matches
    ),
    best_tiers as materialized (
      select canonical_card_id, pg_catalog.min(match_tier)::smallint as match_tier
      from all_match_rows
      group by canonical_card_id
    ),
    ranked_matches as materialized (
      select
        best.canonical_card_id,
        best.match_tier,
        pg_catalog.max(rows.match_score) as match_score
      from best_tiers as best
      join all_match_rows as rows
        on rows.canonical_card_id = best.canonical_card_id
        and rows.match_tier = best.match_tier
      group by best.canonical_card_id, best.match_tier
    ),
    top_candidates as materialized (
      select
        cards.id,
        games.name as game_name,
        cards.name,
        cards.name_kana,
        matches.match_tier,
        matches.match_score
      from ranked_matches as matches
      join public.canonical_cards as cards
        on cards.id = matches.canonical_card_id
        and cards.deleted_at is null
      join public.tcg_games as games on games.id = cards.game_id
      where $3 is null or games.slug = $3
      order by matches.match_tier asc, matches.match_score desc, cards.name
      limit $4
    )
    select
      candidates.id,
      candidates.game_name,
      candidates.name,
      candidates.name_kana,
      (
        select pg_catalog.count(*)::integer
        from public.card_prints as prints
        where prints.canonical_card_id = candidates.id
          and prints.deleted_at is null
      ) as print_count,
      representative.image_key
    from top_candidates as candidates
    left join lateral (
      select prints.image_key
      from public.card_prints as prints
      where prints.canonical_card_id = candidates.id
        and prints.deleted_at is null
        and prints.image_key is not null
      order by prints.id
      limit 1
    ) as representative on true
    order by candidates.match_tier asc, candidates.match_score desc, candidates.name
  $long_search$
  using normalized_query, raw_query, p_game_slug, result_limit, threshold;
end;
$$;

revoke all on function public.search_market_cards(text, text, integer, text)
  from public;
grant execute on function public.search_market_cards(text, text, integer, text)
  to anon, authenticated;
