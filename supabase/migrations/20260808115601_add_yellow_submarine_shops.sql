-- Seed the current Yellow Submarine physical-store list published by the
-- operator. The name_key guard keeps this data migration safe to re-run.

with yellow_submarine_shops(
  name,
  name_kana,
  aliases,
  prefecture,
  municipality,
  address_line,
  website_url
) as (
  values
    ('イエローサブマリン 横浜店', 'いえろーさぶまりん よこはまてん', array['横浜店', 'YS横浜店'], '神奈川県', '横浜市西区', '南幸1-11-2 浜西ビル4階', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 新宿店', 'いえろーさぶまりん しんじゅくてん', array['新宿店', 'YS新宿店'], '東京都', '新宿区', '西新宿1-16-11 AIビル2F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 池袋GAME SHOP', 'いえろーさぶまりん いけぶくろげーむしょっぷ', array['池袋GAME SHOP', '池袋ゲームショップ', 'YS池袋'], '東京都', '豊島区', '東池袋1-15-2 音羽ビル6階', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 町田GAME SHOP', 'いえろーさぶまりん まちだげーむしょっぷ', array['町田GAME SHOP', '町田ゲームショップ', 'YS町田'], '東京都', '町田市', '原町田6-18-13 サニーサイドビル2F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 横浜西口店', 'いえろーさぶまりん よこはまにしぐちてん', array['横浜西口店', 'YS横浜西口店'], '神奈川県', '横浜市西区', '南幸2-7-15 横川ビル4階', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 川越カードショップ', 'いえろーさぶまりん かわごえかーどしょっぷ', array['川越カードショップ', 'YS川越'], '埼玉県', '川越市', '新富町2-11-8 HAMAYA BLD 3階', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 大宮本店・プレイソフト宮原店', 'いえろーさぶまりん おおみやほんてん ぷれいそふとみやはらてん', array['大宮本店', 'プレイソフト宮原店', 'YS大宮本店'], '埼玉県', 'さいたま市北区', '宮原町3-561', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 千葉ゲームショップ', 'いえろーさぶまりん ちばげーむしょっぷ', array['千葉ゲームショップ', 'YS千葉ゲームショップ'], '千葉県', '千葉市中央区', '富士見2-3-1 塚本大千葉ビル3F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 宇都宮店', 'いえろーさぶまりん うつのみやてん', array['宇都宮店', 'YS宇都宮店'], '栃木県', '宇都宮市', '曲師町2-8 宇都宮フェスタ2F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 札幌GAME SHOP', 'いえろーさぶまりん さっぽろげーむしょっぷ', array['札幌GAME SHOP', '札幌ゲームショップ', 'YS札幌'], '北海道', '札幌市中央区', '南三条西4丁目12-1 アルシュ4F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 秋葉原RPGショップ', 'いえろーさぶまりん あきはばらあーるぴーじーしょっぷ', array['秋葉原RPGショップ', 'YS秋葉原RPG'], '東京都', '千代田区', '外神田4-6-1 塩田トゥール秋葉原6F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 秋葉原本店★ミント', 'いえろーさぶまりん あきはばらほんてん みんと', array['秋葉原本店★ミント', '秋葉原本店ミント', 'YS秋葉原本店'], '東京都', '千代田区', '外神田1-15-16 ラジオ会館6F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 柏店', 'いえろーさぶまりん かしわてん', array['柏店', 'YS柏店'], '千葉県', '柏市', '柏2-3-1 フーサワビル6F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 立川店', 'いえろーさぶまりん たちかわてん', array['立川店', 'YS立川店'], '東京都', '立川市', '柴崎町3-7-17 N2ビル2F・3F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 川崎店', 'いえろーさぶまりん かわさきてん', array['川崎店', 'YS川崎店'], '神奈川県', '川崎市川崎区', '小川町2-7 アイヴィ・タワー地下1階', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 溝口店', 'いえろーさぶまりん みぞのくちてん', array['溝口店', 'YS溝口店'], '神奈川県', '川崎市高津区', '溝の口1-9-5 スギザキビル3F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 千葉店', 'いえろーさぶまりん ちばてん', array['千葉店', 'YS千葉店'], '千葉県', '千葉市中央区', '富士見2-3-1 塚本大千葉ビル3F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン なんば本店', 'いえろーさぶまりん なんばほんてん', array['なんば本店', 'YSなんば本店'], '大阪府', '大阪市浪速区', '難波中2-1-3 川合ビル', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 京都店', 'いえろーさぶまりん きょうとてん', array['京都店', 'YS京都店'], '京都府', '京都市中京区', '蛸薬師通り新京極東入裏寺町598 河原町OKIビル4F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン なんば店', 'いえろーさぶまりん なんばてん', array['なんば店', 'YSなんば店'], '大阪府', '大阪市浪速区', '日本橋3-8-23', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 名古屋GAME SHOP', 'いえろーさぶまりん なごやげーむしょっぷ', array['名古屋GAME SHOP', '名古屋ゲームショップ', 'YS名古屋'], '愛知県', '名古屋市中区', '大須3-11-19 OAビル6F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 三宮店', 'いえろーさぶまりん さんのみやてん', array['三宮店', 'YS三宮店'], '兵庫県', '神戸市中央区', '三宮町2-11-1 センタープラザ西館2F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 姫路店', 'いえろーさぶまりん ひめじてん', array['姫路店', 'YS姫路店'], '兵庫県', '姫路市', '亀井町52 外川ビル3F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン マジッカーズ福岡店', 'いえろーさぶまりん まじっかーずふくおかてん', array['マジッカーズ福岡店', 'YS福岡店'], '福岡県', '福岡市中央区', '天神2-7-14 天神シティビル3F', 'https://yellowsubmarine.co.jp/'),
    ('イエローサブマリン 広島店', 'いえろーさぶまりん ひろしまてん', array['広島店', 'YS広島店'], '広島県', '広島市中区', '大手町1-5-14 吉岡ビル', 'https://yellowsubmarine.co.jp/')
)
insert into public.shops (
  name,
  name_kana,
  aliases,
  prefecture,
  municipality,
  address_line,
  website_url
)
select
  source.name,
  source.name_kana,
  source.aliases,
  source.prefecture,
  source.municipality,
  source.address_line,
  source.website_url
from yellow_submarine_shops as source
where not exists (
  select 1
  from public.shops as existing
  where existing.name_key = pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(source.name),
      '[[:space:]　]+',
      '',
      'g'
    )
  )
);
