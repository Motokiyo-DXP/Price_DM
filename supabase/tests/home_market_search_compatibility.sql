-- Run after the schema and add_home_market_search_rpc migration.
-- Short Japanese terms deliberately use the same prefix-only contract as the
-- registration short path. Long queries retain shared candidate IDs and order.
do $$
declare
  case_row record;
  shared_ids bigint[];
  market_ids bigint[];
begin
  for case_row in
    select * from (values
      ('one_character', 'ボ', 'broad'),
      ('two_characters', 'ボル', 'broad'),
      ('common_name', 'ボルシャック', 'broad'),
      ('sparse_name', 'ギギャイア', 'broad'),
      ('print_prefix', 'RP3', 'broad'),
      ('alias', 'パーフェクト・アルカディア', 'broad'),
      ('reading', 'ボルメテウス・ムシャ・ドラゴン', 'broad'),
      ('contains', 'るしゃっく', 'broad'),
      ('fuzzy', 'ぼるめてうすむしやどらごん', 'broad'),
      ('card_number', 'DM26-EX2', 'broad'),
      ('product_name', '悪感謝祭', 'broad'),
      ('precise', 'ボルシャック', 'precise')
    ) as cases(kind, query, mode)
  loop
    select coalesce(array_agg(id order by ord), '{}'::bigint[])
      into shared_ids
    from public.search_canonical_cards(
      p_query => case_row.query,
      p_game_slug => 'duel-masters',
      p_limit => 100,
      p_mode => case_row.mode
    ) with ordinality as shared(id, game_slug, game_name, name, name_kana, print_count, ord);

    select coalesce(array_agg(id order by ord), '{}'::bigint[])
      into market_ids
    from public.search_market_cards(
      p_query => case_row.query,
      p_game_slug => 'duel-masters',
      p_limit => 100,
      p_mode => case_row.mode
    ) with ordinality as market(id, game_name, name, name_kana, print_count, ord);

    if case_row.kind in ('one_character', 'two_characters') then
      if shared_ids <> '{}'::bigint[] and market_ids = '{}'::bigint[] then
        raise exception 'short home search unexpectedly returned no candidates for %', case_row.query;
      end if;
      if case_row.query in ('ボ', 'ボル') and cardinality(market_ids) <> 100 then
        raise exception 'short fixture should exercise the full 100 candidates for %; got %',
          case_row.query, cardinality(market_ids);
      end if;
    elsif shared_ids is distinct from market_ids then
      raise exception 'home search result changed for % (%): shared %, home %',
        case_row.kind, case_row.query, shared_ids, market_ids;
    end if;
  end loop;
end;
$$;
