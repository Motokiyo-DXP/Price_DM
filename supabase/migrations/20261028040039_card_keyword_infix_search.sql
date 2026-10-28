-- Preserve the deployed term normalization. Only query routing counts long vowels.
create function private.card_search_input_length(p_query text)
returns integer language sql immutable parallel safe security invoker set search_path = ''
as $$
  select pg_catalog.char_length(pg_catalog.regexp_replace(
    pg_catalog.lower(normalize(coalesce(p_query, ''), NFKC)),
    '[^a-zぁ-ゖァ-ヺー一-鿿㐀-䶿豈-﫿]', '', 'g'));
$$;

create function private.card_search_words(p_query text)
returns table(raw_query text, normalized_query text)
language sql immutable parallel safe security invoker set search_path = ''
as $$
  select distinct word, public.normalize_card_search(word)
  from pg_catalog.regexp_split_to_table(pg_catalog.btrim(normalize(coalesce(p_query, ''), NFKC)), '[[:space:]　]+') as word
  where private.card_search_input_length(word) > 0 or word ~ '[0-9]';
$$;

create function private.card_search_single_term_matches(
  p_query text,
  p_include_relevance_score boolean default false,
  p_mode text default 'broad'
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
security invoker
set search_path = ''
as $$
declare
  p_normalized_query text := public.normalize_card_search(p_query);
  threshold real := case when p_mode = 'precise' then 0.90::real else 0.60::real end;
  prefix_upper text;
  last_codepoint integer;
begin
  if coalesce(p_normalized_query, '') = '' then
    return;
  end if;

  if private.card_search_input_length(p_query) <= 2 then
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
        and extensions.similarity(terms.normalized_term, $1) >= $2
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
  using p_normalized_query, threshold;
end;
$$;


-- No per-keyword LIMIT: intersect all candidate IDs before ranking/pagination.
-- Print metadata may satisfy a word, but cannot bypass another word's AND condition.
create function private.card_search_query_matches(p_query text, p_mode text default 'broad', p_include_score boolean default true)
returns table(canonical_card_id bigint, is_exact boolean, is_prefix boolean, is_contains boolean, match_tier smallint, match_score real)
language sql stable security invoker set search_path = ''
as $$
  with words as materialized (select * from private.card_search_words(p_query)),
  match_rows as materialized (
    select words.raw_query as word, matches.*
    from words cross join lateral private.card_search_single_term_matches(words.raw_query, p_include_score, p_mode) as matches
    union all
    select words.raw_query, prints.canonical_card_id, false, false, false, 5::smallint, 0::real
    from words cross join lateral private.registration_card_print_candidates(words.normalized_query, words.raw_query) as prints
    where (select count(*) from words) > 1
  ), word_matches as (
    select rows.word, rows.canonical_card_id,
      pg_catalog.bool_or(rows.is_exact) as is_exact,
      pg_catalog.bool_or(rows.is_prefix) as is_prefix,
      pg_catalog.bool_or(rows.is_contains) as is_contains,
      pg_catalog.min(rows.match_tier)::smallint as match_tier,
      pg_catalog.max(rows.match_score) as match_score
    from match_rows as rows group by rows.word, rows.canonical_card_id
  )
  select matches.canonical_card_id,
    pg_catalog.bool_and(matches.is_exact), pg_catalog.bool_and(matches.is_prefix),
    pg_catalog.bool_and(matches.is_contains), pg_catalog.max(matches.match_tier)::smallint,
    pg_catalog.avg(matches.match_score)::real
  from word_matches as matches group by matches.canonical_card_id
  having count(*) = (select count(*) from words);
$$;

revoke all on function private.card_search_input_length(text), private.card_search_words(text),
  private.card_search_single_term_matches(text,boolean,text), private.card_search_query_matches(text,text,boolean) from public;
grant execute on function private.card_search_input_length(text), private.card_search_words(text),
  private.card_search_single_term_matches(text,boolean,text), private.card_search_query_matches(text,text,boolean) to anon, authenticated;

create function public.search_registration_cards_page(
  p_query text, p_game_slug text default null,
  p_limit integer default 30, p_mode text default 'broad', p_offset integer default 0
)
returns table(id bigint, game_slug text, game_name text, name text, name_kana text, print_count integer)
language sql stable security invoker set search_path = ''
as $$
  with input as materialized (
    select public.normalize_card_search(p_query) as normalized_query,
      pg_catalog.btrim(coalesce(p_query, '')) as raw_query,
      (select count(*) from private.card_search_words(p_query)) as word_count
  ), matches as materialized (
    select * from private.card_search_query_matches(p_query, p_mode, private.card_search_input_length(p_query) >= 3)
    union all
    select prints.canonical_card_id, false, false, false, 5::smallint, 0::real
    from input cross join lateral private.registration_card_print_candidates(input.normalized_query, input.raw_query) as prints
    where input.word_count <= 1 and input.normalized_query <> ''
      and (pg_catalog.char_length(input.raw_query) > 2 or input.raw_query ~ '^[0-9A-Za-z]{1,2}$')
  ), ranked as materialized (
    select matches.canonical_card_id, pg_catalog.bool_or(matches.is_exact) as is_exact,
      pg_catalog.bool_or(matches.is_prefix) as is_prefix, pg_catalog.bool_or(matches.is_contains) as is_contains,
      pg_catalog.min(matches.match_tier)::smallint as match_tier, pg_catalog.max(matches.match_score) as match_score
    from matches group by matches.canonical_card_id
    union all select cards.id, false, false, false, 5::smallint, 0::real from public.canonical_cards as cards cross join input where input.normalized_query = '' and input.word_count <= 1
  ), page as materialized (
    select cards.id, games.slug as game_slug, games.name as game_name, cards.name, cards.name_kana,
      ranked.is_exact, ranked.is_prefix, ranked.is_contains, ranked.match_tier, ranked.match_score
    from ranked join public.canonical_cards as cards on cards.id = ranked.canonical_card_id and cards.deleted_at is null
    join public.tcg_games as games on games.id = cards.game_id
    where p_game_slug is null or games.slug = p_game_slug
    order by ranked.is_exact desc, ranked.is_prefix desc, ranked.is_contains desc,
      ranked.match_score desc, cards.name, cards.id
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select page.id, page.game_slug, page.game_name, page.name, page.name_kana,
    (select count(*)::integer from public.card_prints as prints where prints.canonical_card_id = page.id and prints.deleted_at is null)

  from page order by page.is_exact desc, page.is_prefix desc, page.is_contains desc,
    page.match_score desc, page.name, page.id;
$$;
revoke all on function public.search_registration_cards_page(text,text,integer,text,integer) from public;
grant execute on function public.search_registration_cards_page(text,text,integer,text,integer) to anon, authenticated;

create or replace function public.search_registration_cards(
  p_query text, p_game_slug text default null,
  p_limit integer default 30, p_mode text default 'broad'
)
returns table(id bigint, game_slug text, game_name text, name text, name_kana text, print_count integer)
language sql stable security invoker set search_path = ''
as $$ select * from public.search_registration_cards_page(p_query, p_game_slug, p_limit, p_mode, 0); $$;

create function public.search_market_cards_page(
  p_query text, p_game_slug text default 'duel-masters',
  p_limit integer default 100, p_mode text default 'broad', p_offset integer default 0
)
returns table(id bigint, game_name text, name text, name_kana text, print_count integer, image_key text)
language sql stable security invoker set search_path = ''
as $$
  with input as materialized (
    select public.normalize_card_search(p_query) as normalized_query,
      pg_catalog.btrim(coalesce(p_query, '')) as raw_query,
      (select count(*) from private.card_search_words(p_query)) as word_count
  ), matches as materialized (
    select * from private.card_search_query_matches(p_query, p_mode)
    union all
    select prints.canonical_card_id, false, false, false, 5::smallint, 0::real
    from input cross join lateral private.market_card_print_candidates(input.normalized_query, input.raw_query, null) as prints
    where input.word_count <= 1 and input.normalized_query <> ''
  ), ranked as materialized (
    select matches.canonical_card_id, pg_catalog.bool_or(matches.is_exact) as is_exact,
      pg_catalog.bool_or(matches.is_prefix) as is_prefix, pg_catalog.bool_or(matches.is_contains) as is_contains,
      pg_catalog.min(matches.match_tier)::smallint as match_tier, pg_catalog.max(matches.match_score) as match_score
    from matches group by matches.canonical_card_id

  ), page as materialized (
    select cards.id, games.slug as game_slug, games.name as game_name, cards.name, cards.name_kana,
      ranked.is_exact, ranked.is_prefix, ranked.is_contains, ranked.match_tier, ranked.match_score
    from ranked join public.canonical_cards as cards on cards.id = ranked.canonical_card_id and cards.deleted_at is null
    join public.tcg_games as games on games.id = cards.game_id
    where p_game_slug is null or games.slug = p_game_slug
    order by ranked.match_tier asc,
      ranked.match_score desc, cards.name, cards.id
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select page.id, page.game_name, page.name, page.name_kana,
    (select count(*)::integer from public.card_prints as prints where prints.canonical_card_id = page.id and prints.deleted_at is null)
    , (select prints.image_key from public.card_prints as prints where prints.canonical_card_id = page.id and prints.deleted_at is null and prints.image_key is not null order by prints.id limit 1)
  from page order by page.match_tier asc,
    page.match_score desc, page.name, page.id;
$$;
revoke all on function public.search_market_cards_page(text,text,integer,text,integer) from public;
grant execute on function public.search_market_cards_page(text,text,integer,text,integer) to anon, authenticated;

create or replace function public.search_market_cards(
  p_query text, p_game_slug text default 'duel-masters',
  p_limit integer default 100, p_mode text default 'broad'
)
returns table(id bigint, game_name text, name text, name_kana text, print_count integer, image_key text)
language sql stable security invoker set search_path = ''
as $$ select * from public.search_market_cards_page(p_query, p_game_slug, p_limit, p_mode, 0); $$;

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
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from private.card_search_words(p_query)) > 1 then
    return query select * from public.search_registration_cards_page(p_query,p_game_slug,p_limit,p_mode,0);
    return;
  end if;
  return query
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
        or (terms.normalized_term operator(extensions.%) input.normalized_query
          and extensions.similarity(terms.normalized_term, input.normalized_query) >= input.threshold)
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
      from private.card_search_query_matches(p_query, 'broad', p_sort = 'relevance')
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
        and (select count(*) from private.card_search_words(p_query)) <= 1
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
