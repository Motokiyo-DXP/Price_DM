-- Preserve RPC signatures, permissions and candidate ranking.
create or replace function private.deck_filter_options_impl()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'products', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', product_name, 'codes', codes
      ) order by product_name), '[]'::jsonb)
      from (
        select p.product_name, array_agg(distinct cp.product_code)
          filter (where cp.product_code is not null) as codes
        from public.card_prints p
        join public.canonical_cards c on c.id = p.canonical_card_id and c.deleted_at is null
        join public.tcg_games g on g.id = c.game_id and g.slug = 'duel-masters'
        left join public.card_products cp on cp.id = p.product_id
        where p.deleted_at is null and p.product_name is not null
        group by p.product_name
      ) products
    ),
    'cardTypes', (
      select coalesce(pg_catalog.jsonb_agg(card_type order by card_type), '[]'::jsonb)
      from (
        select distinct unnest(c.card_types) as card_type
        from public.canonical_cards c
        join public.tcg_games g on g.id = c.game_id and g.slug = 'duel-masters'
        where c.deleted_at is null
      ) types
    ),
    'races', (
      select coalesce(pg_catalog.jsonb_agg(race order by race), '[]'::jsonb)
      from (
        select distinct race
        from public.canonical_cards c
        join public.tcg_games g on g.id = c.game_id and g.slug = 'duel-masters'
        cross join lateral pg_catalog.unnest(c.races) as race
        where c.deleted_at is null and race is not null
      ) races
    ),
    'costs', (
      select coalesce(pg_catalog.jsonb_agg(cost order by cost), '[]'::jsonb)
      from (
        select distinct c.cost
        from public.canonical_cards c
        join public.tcg_games g on g.id = c.game_id and g.slug = 'duel-masters'
        where c.deleted_at is null and c.cost is not null
      ) costs
    )
  );
end;
$$;

create or replace function private.search_deck_cards_filtered_fast_impl(
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
  p_image text default 'all',
  p_min_power integer default null,
  p_max_power integer default null,
  p_race_tokens text[] default '{}'::text[],
  p_card_text_query text default null
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
  race_tokens text[] := array(
    select distinct pg_catalog.btrim(token)
    from pg_catalog.unnest(p_race_tokens) as token
    where nullif(pg_catalog.btrim(token), '') is not null
  );
  text_tokens text[] := array(
    select distinct token
    from pg_catalog.regexp_split_to_table(pg_catalog.btrim(coalesce(p_card_text_query, '')), '[[:space:]　]+') as token
    where token <> ''
  );
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
        (p_min_power is null or cards.power_value >= p_min_power
          or (cards.power_text = '∞' and p_max_power is null))
        and (p_max_power is null or cards.power_value <= p_max_power)
        and case when pg_catalog.cardinality(race_tokens) = 0 then true else not exists (
          select 1 from pg_catalog.unnest(race_tokens) as token
          where not exists (
            select 1 from pg_catalog.unnest(cards.races) as race
            where pg_catalog.strpos(pg_catalog.lower(race), pg_catalog.lower(token)) > 0
          )
        ) end
        -- Do not read card_texts at all when the text condition is empty.
        and case when pg_catalog.cardinality(text_tokens) = 0 then true else not exists (
          select 1 from pg_catalog.unnest(text_tokens) as token
          where not exists (
            select 1 from public.card_prints as prints
            cross join lateral pg_catalog.unnest(prints.card_texts) as card_text
            where prints.canonical_card_id = cards.id
              and prints.deleted_at is null
              and pg_catalog.strpos(pg_catalog.lower(card_text), pg_catalog.lower(token)) > 0
          )
        ) end
        and (nullif(p_product_name, '') is null or exists (
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
          or (cards.cost is null and not coalesce(cards.cost_is_infinite, false) and p_no_cost)
          or (cards.cost_is_infinite and p_max_cost is null)
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

