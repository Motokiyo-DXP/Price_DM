-- Run after the current schema and both registration-card-search migrations.
-- 1-2 character queries intentionally use prefix-only matching and therefore
-- are checked for responsiveness/availability, not equality with the shared
-- contains/fuzzy RPC. Every 3+ character case must retain the shared RPC's
-- ordered candidate IDs.
do $$
declare
  case_row record;
  shared_ids bigint[];
  registration_ids bigint[];
begin
  for case_row in
    with dynamic_cases as (
      select * from (
        select 'alias'::text as kind, term as query, 'broad'::text as mode
        from public.card_search_terms
        where term_kind = 'alias' and pg_catalog.char_length(normalized_term) >= 3
        order by id limit 1
      ) as alias_case

      union all

      select * from (
        select 'reading'::text, term, 'broad'::text
        from public.card_search_terms
        where term_kind in ('official_reading', 'alias_reading')
          and pg_catalog.char_length(normalized_term) >= 3
        order by id limit 1
      ) as reading_case

      union all

      select * from (
        select 'card_number'::text, card_number, 'broad'::text
        from public.card_prints
        where card_number is not null and pg_catalog.char_length(card_number) >= 3
          and deleted_at is null
        order by id limit 1
      ) as card_number_case

      union all

      select * from (
        select 'product_name'::text, product_name, 'broad'::text
        from public.card_prints
        where product_name is not null and pg_catalog.char_length(product_name) >= 3
          and deleted_at is null
        order by id limit 1
      ) as product_name_case
    )
    select * from (
      values
        ('one_character', 'ボ', 'broad'),
        ('two_characters', 'ボル', 'broad'),
        ('common_name', 'ボルシャック', 'broad'),
        ('sparse_name', 'ギギャイア', 'broad'),
        ('print_prefix', 'RP3', 'broad'),
        ('broad', 'ボルシャック', 'broad'),
        ('precise', 'ボルシャック', 'precise')
    ) as fixed_cases(kind, query, mode)
    union all
    select * from dynamic_cases
  loop
    select coalesce(array_agg(id order by ord), '{}'::bigint[])
      into shared_ids
    from public.search_canonical_cards(
      p_query => case_row.query,
      p_game_slug => 'duel-masters',
      p_limit => 30,
      p_mode => case_row.mode
    ) with ordinality as shared(id, game_slug, game_name, name, name_kana, print_count, ord);

    select coalesce(array_agg(id order by ord), '{}'::bigint[])
      into registration_ids
    from public.search_registration_cards(
      p_query => case_row.query,
      p_game_slug => 'duel-masters',
      p_limit => 30,
      p_mode => case_row.mode
    ) with ordinality as registration(id, game_slug, game_name, name, name_kana, print_count, ord);

    if case_row.kind in ('one_character', 'two_characters') then
      if shared_ids <> '{}'::bigint[] and registration_ids = '{}'::bigint[] then
        raise exception 'short registration search unexpectedly returned no candidates for %', case_row.query;
      end if;
    elsif shared_ids is distinct from registration_ids then
      raise exception 'registration search result changed for % (%): shared %, registration %',
        case_row.kind, case_row.query, shared_ids, registration_ids;
    end if;
  end loop;
end;
$$;
