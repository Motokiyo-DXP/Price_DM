-- Two verified official cards used to exercise normalized-name and alternate-
-- reading search before the resumable full catalog import is complete.

with duel_masters as (
  select id as game_id
  from public.tcg_games
  where slug = 'duel-masters'
)
insert into public.cards(
  game_id,
  name,
  name_kana,
  aliases,
  aliases_kana,
  card_number,
  product_name,
  official_url
)
select
  game_id,
  '理想と平和の決断',
  'リソウトヘイワノケツダン',
  array['パーフェクト・アルカディア'],
  array['ぱーふぇくと・あるかでぃあ'],
  'DM26SD1 4/11',
  'DM26-SD1 ドキドキつよいデッキ 25の王道',
  'https://dm.takaratomy.co.jp/card/detail/?id=dm26sd1-o004'
from duel_masters
union all
select
  game_id,
  'ボルメテウス・武者・ドラゴン',
  'ボルメテウス・ムシャ・ドラゴン',
  '{}'::text[],
  '{}'::text[],
  'DM27 S4/S10',
  'DM-27 「極神編 第4弾 完全極神」',
  'https://dm.takaratomy.co.jp/card/detail/?id=27-S004'
from duel_masters
on conflict (game_id, name, card_number) do update
set name_kana = excluded.name_kana,
    aliases = excluded.aliases,
    aliases_kana = excluded.aliases_kana,
    product_name = excluded.product_name,
    official_url = excluded.official_url;

