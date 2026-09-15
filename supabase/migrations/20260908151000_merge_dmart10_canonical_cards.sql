begin;

create temporary table dmart10_equivalents (
  official_card_id text primary key,
  source_name text not null,
  canonical_name text not null,
  aliases text[] not null,
  alias_readings text[] not null
) on commit drop;

insert into dmart10_equivalents values
  ('dmart10-001', 'オプティマスプライム [“罰怒“ブランド]', '“罰怒“ブランド',
    array['オプティマスプライム', 'オプティマスプライム [“罰怒“ブランド]'],
    array['オプティマス プライム', 'オプティマスプライム バチイカブランド']),
  ('dmart10-002', 'オプティマスプライマル [我我我ガイアール・ブランド]', '我我我ガイアール・ブランド',
    array['オプティマスプライマル', 'オプティマスプライマル [我我我ガイアール・ブランド]'],
    array['オプティマス プライマル', 'オプティマスプライマル ワガワガワガガイアールブランド']),
  ('dmart10-003', 'バンブルビー [切札勝太&カツキング ー熱血の物語ー]', '切札勝太&カツキング ー熱血の物語ー',
    array['バンブルビー', 'バンブルビー [切札勝太&カツキング ー熱血の物語ー]'],
    array['バンブルビー', 'バンブルビー キリフダカツタ カツキング ネッケツノモノガタリ']),
  ('dmart10-004', 'スカージ [ガチャンコ ガチロボ]', 'ガチャンコ ガチロボ',
    array['スカージ', 'スカージ [ガチャンコ ガチロボ]'],
    array['スカージ', 'スカージ ガチャンコ ガチロボ']),
  ('dmart10-005', 'チーター [奇天烈 シャッフ]', '奇天烈 シャッフ',
    array['チーター', 'チーター [奇天烈 シャッフ]'],
    array['チーター', 'チーター キテレツ シャッフ']),
  ('dmart10-006', 'アーシー [最終龍覇 ロージア]', '最終龍覇 ロージア',
    array['アーシー', 'アーシー [最終龍覇 ロージア]'],
    array['アーシー', 'アーシー サイシュウリュウハ ロージア']);

create temporary table dmart10_card_ids on commit drop as
select equivalents.*, source.id as source_id, target.id as target_id
from dmart10_equivalents equivalents
join public.tcg_games game on game.slug = 'duel-masters'
join public.canonical_cards source on source.game_id = game.id and source.name = equivalents.source_name and source.deleted_at is null
join public.canonical_cards target on target.game_id = game.id and target.name = equivalents.canonical_name and target.deleted_at is null;

update public.card_prints prints
set canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart10_card_ids ids
where lower(prints.official_card_id) = ids.official_card_id
  and prints.canonical_card_id = ids.source_id;

update public.price_records records
set canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart10_card_ids ids
where records.canonical_card_id = ids.source_id;

update public.deck_cards cards
set canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart10_card_ids ids
where cards.canonical_card_id = ids.source_id;

update public.decks decks
set icon_canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart10_card_ids ids
where decks.icon_canonical_card_id = ids.source_id;

delete from public.account_card_bookmarks source
using dmart10_card_ids ids
where source.canonical_card_id = ids.source_id
  and exists (
    select 1 from public.account_card_bookmarks target
    where target.user_id = source.user_id and target.canonical_card_id = ids.target_id
  );

update public.account_card_bookmarks bookmarks
set canonical_card_id = ids.target_id
from dmart10_card_ids ids
where bookmarks.canonical_card_id = ids.source_id;

insert into public.card_search_terms(canonical_card_id, term, normalized_term, term_kind, source, verified, priority)
select ids.target_id, terms.term, public.normalize_card_search(terms.term), terms.term_kind, 'official_product_exception', true, terms.priority
from dmart10_card_ids ids
cross join lateral (
  select alias as term, 'alias'::text as term_kind, 5::smallint as priority from unnest(ids.aliases) alias
  union all
  select reading, 'alias_reading'::text, 6::smallint from unnest(ids.alias_readings) reading
) terms
where public.normalize_card_search(terms.term) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term, source = excluded.source, verified = excluded.verified,
    priority = excluded.priority, updated_at = pg_catalog.now();

update public.canonical_cards target
set aliases = (
      select array_agg(distinct value) from unnest(target.aliases || ids.aliases) value
    ),
    aliases_kana = (
      select array_agg(distinct value) from unnest(target.aliases_kana || ids.alias_readings) value
    ),
    updated_at = pg_catalog.now()
from dmart10_card_ids ids
where target.id = ids.target_id;

update public.canonical_cards source
set deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
from dmart10_card_ids ids
where source.id = ids.source_id;

commit;
