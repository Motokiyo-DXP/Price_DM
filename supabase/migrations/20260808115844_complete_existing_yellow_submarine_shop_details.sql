-- Complete records that predated the Yellow Submarine store-list import.

with shop_details(
  name,
  name_kana,
  aliases,
  prefecture,
  municipality,
  address_line,
  website_url
) as (
  values
    (
      'イエローサブマリン 横浜店',
      'いえろーさぶまりん よこはまてん',
      array['横浜店', 'YS横浜店'],
      '神奈川県',
      '横浜市西区',
      '南幸1-11-2 浜西ビル4階',
      'https://yellowsubmarine.co.jp/'
    ),
    (
      'イエローサブマリン 秋葉原本店★ミント',
      'いえろーさぶまりん あきはばらほんてん みんと',
      array['秋葉原本店★ミント', '秋葉原本店ミント', 'YS秋葉原本店'],
      '東京都',
      '千代田区',
      '外神田1-15-16 ラジオ会館6F',
      'https://yellowsubmarine.co.jp/'
    )
)
update public.shops as shops
set
  name_kana = details.name_kana,
  aliases = details.aliases,
  prefecture = details.prefecture,
  municipality = details.municipality,
  address_line = details.address_line,
  website_url = details.website_url,
  updated_at = pg_catalog.now()
from shop_details as details
where shops.name = details.name;
