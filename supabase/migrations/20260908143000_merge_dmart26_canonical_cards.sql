begin;

create temporary table dmart26_equivalents (
  official_card_id text primary key,
  source_name text not null,
  canonical_name text not null,
  aliases text[] not null,
  alias_readings text[] not null
) on commit drop;

insert into dmart26_equivalents values
  ('dmart26-001', 'ドギラN装備【ガンランス】vs.煌雷竜 蒼き守護神 ドギラゴン閃', '蒼き守護神 ドギラゴン閃',
    array['ドギラN装備【ガンランス】vs.煌雷竜', 'ドギラノヴァ装備【ガンランス】vs.レ・ダウ'],
    array['ドギラノヴァそうび ガンランス バーサス レダウ', 'ドギラN装備そうび【ガンランス】vsバーサス.煌雷竜']),
  ('dmart26-002', 'ゲンム装備【ヘビィボウガン】vs.波衣竜 ∞龍 ゲンムエンペラー', '∞龍 ゲンムエンペラー',
    array['ゲンム装備【ヘビィボウガン】vs.波衣竜', 'ゲンム装備【ヘビィボウガン】vs.ウズ・トゥナ'],
    array['ゲンムそうび ヘビィボウガン バーサス ウズトゥナ', 'ゲンム装備そうび【ヘビィボウガン】vsバーサス.波衣竜']),
  ('dmart26-003', '鬼丸装備【双剣】vs.鎖刃竜 偽りの希望 鬼丸「終斗」', '偽りの希望 鬼丸「終斗」',
    array['鬼丸装備【双剣】vs.鎖刃竜', '鬼丸装備【双剣】vs.アルシュベルド'],
    array['おにまるそうび そうけん バーサス アルシュベルド', '鬼丸装備そうび【双剣】vsバーサス.鎖刃竜']),
  ('dmart26-004', 'ドギラH装備【大剣】vs.獄焔蛸 紅き団長 ドギラゴン悪', '紅き団長 ドギラゴン悪',
    array['ドギラH装備【大剣】vs.獄焔蛸', 'ドギラヒート装備【大剣】vs.ヌ・エグドラ'],
    array['ドギラヒートそうび たいけん バーサス ヌエグドラ', 'ドギラH装備そうび【大剣】vsバーサス.獄焔蛸']),
  ('dmart26-005', 'ボルシャック装備【太刀】vs.護火竜 ボルシャック・ドリーム・ドラゴン', 'ボルシャック・ドリーム・ドラゴン',
    array['ボルシャック装備【太刀】vs.護火竜', 'ボルシャック装備【太刀】vs.護竜リオレウス'],
    array['ボルシャックそうび たち バーサス ごかりゅう', 'ボルシャック装備そうび【太刀】vsバーサス.護火竜']),
  ('dmart26-006', 'キーナリー装備【ハンマー】vs.凍峰竜 終末縫合王 ザ=キラー・キーナリー', '終末縫合王 ザ=キラー・キーナリー',
    array['キーナリー装備【ハンマー】vs.凍峰竜', 'キーナリー装備【ハンマー】vs.ジン・ダハド'],
    array['キーナリーそうび ハンマー バーサス ジンダハド', 'キーナリー装備そうび【ハンマー】vsバーサス.凍峰竜']);

create temporary table dmart26_card_ids on commit drop as
select equivalents.*, source.id as source_id, target.id as target_id
from dmart26_equivalents equivalents
join public.tcg_games game on game.slug = 'duel-masters'
join public.canonical_cards source on source.game_id = game.id and source.name = equivalents.source_name and source.deleted_at is null
join public.canonical_cards target on target.game_id = game.id and target.name = equivalents.canonical_name and target.deleted_at is null;

update public.card_prints prints
set canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart26_card_ids ids
where lower(prints.official_card_id) = ids.official_card_id
  and prints.canonical_card_id = ids.source_id;

update public.price_records records
set canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart26_card_ids ids
where records.canonical_card_id = ids.source_id;

update public.deck_cards cards
set canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart26_card_ids ids
where cards.canonical_card_id = ids.source_id;

update public.decks decks
set icon_canonical_card_id = ids.target_id, updated_at = pg_catalog.now()
from dmart26_card_ids ids
where decks.icon_canonical_card_id = ids.source_id;

delete from public.account_card_bookmarks source
using dmart26_card_ids ids
where source.canonical_card_id = ids.source_id
  and exists (
    select 1 from public.account_card_bookmarks target
    where target.user_id = source.user_id and target.canonical_card_id = ids.target_id
  );

update public.account_card_bookmarks bookmarks
set canonical_card_id = ids.target_id
from dmart26_card_ids ids
where bookmarks.canonical_card_id = ids.source_id;

insert into public.card_search_terms(canonical_card_id, term, normalized_term, term_kind, source, verified, priority)
select ids.target_id, terms.term, public.normalize_card_search(terms.term), terms.term_kind, 'official_product_exception', true, terms.priority
from dmart26_card_ids ids
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
from dmart26_card_ids ids
where target.id = ids.target_id;

update public.canonical_cards source
set deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
from dmart26_card_ids ids
where source.id = ids.source_id;

commit;
