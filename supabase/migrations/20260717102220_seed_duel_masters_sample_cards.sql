-- Seed a verified, limited Duel Masters sample from the official card search.
-- Idempotent through the existing unique key on (game_id, name, card_number).

with dm_game as (
  select id
  from public.tcg_games
  where slug = 'duel-masters'
),
source(name, name_kana, card_number, product_name, official_url) as (
  values
    ('竜皇神 ボルシャック・バクテラス', null::text, 'DM26EX2 MC1/30', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-MC001'),
    ('引き裂かれし永劫、エムラクール', null::text, 'DM26EX2 PR1/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR001'),
    ('引き裂かれし永劫、エムラクール', null::text, 'DM26EX2 PR1超/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR001CHO'),
    ('龍頭星雲人 / 零誕祭', null::text, 'DM26EX2 PR2/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR002'),
    ('龍頭星雲人 / 零誕祭', null::text, 'DM26EX2 PR2超/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR002CHO'),
    ('超神星DOOM・ドラゲリオン', null::text, 'DM26EX2 PR3/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR003'),
    ('超神星DOOM・ドラゲリオン', null::text, 'DM26EX2 PR3超/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR003CHO'),
    ('アーテル・ゴルギーニ', null::text, 'DM26EX2 PR4/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR004'),
    ('アーテル・ゴルギーニ', null::text, 'DM26EX2 PR4超/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR004CHO'),
    ('轟䡛合体 ゴルギーオージャー', null::text, 'DM26EX2 PR5/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR005'),
    ('轟䡛合体 ゴルギーオージャー', null::text, 'DM26EX2 PR5超/PR10', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR005CHO'),
    ('ボルシャック・アークゼオスNEX', null::text, 'DM26EX2 3/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-003'),
    ('水蜃 フカフチノカミ', null::text, 'DM26EX2 4/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-004'),
    ('嵐神 ミヅハノクエビコ', null::text, 'DM26EX2 5/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-005'),
    ('邪眼破壊神R・R・R', null::text, 'DM26EX2 6/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-006'),
    ('～墓碑に刻まれし魔弾の名～', null::text, 'DM26EX2 7/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-007'),
    ('夢の轟速 ザ・ランド', null::text, 'DM26EX2 8/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-008'),
    ('魔誕の悪魔デスモナーク', null::text, 'DM26EX2 9/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-009'),
    ('邪眼破壊神デスアポロヌス・ドラゲリオン', null::text, 'DM26EX2 10/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-010'),
    ('「涅槃」の鬼 ゲドウ大権現', null::text, 'DM26EX2 11/89', 'DM26-EX2 悪感謝祭 カリスマBEST', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-011')
)
insert into public.cards (
  game_id,
  name,
  name_kana,
  card_number,
  product_name,
  official_url
)
select
  dm_game.id,
  source.name,
  source.name_kana,
  source.card_number,
  source.product_name,
  source.official_url
from dm_game
cross join source
on conflict (game_id, name, card_number) do update
set
  name_kana = coalesce(excluded.name_kana, public.cards.name_kana),
  product_name = excluded.product_name,
  official_url = excluded.official_url;
