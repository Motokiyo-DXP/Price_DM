-- Repair product names only when the official print prefix has exactly one
-- authoritative product name already present in the catalog.
with base as (
  select id,
    upper(regexp_replace(split_part(official_card_id, '-', 1), '[-_]', '', 'g')) id_set,
    upper(regexp_replace(split_part(product_name, ' ', 1), '[-_]', '', 'g')) product_set
  from public.card_prints
), mappings as (
  select id_set, min(product_name) product_name, count(distinct product_name) names
  from public.card_prints prints
  join base on base.id = prints.id
  where base.id_set = base.product_set
  group by id_set
)
update public.card_prints prints
set product_name = mappings.product_name, updated_at = pg_catalog.now()
from base join mappings using (id_set)
where prints.id = base.id
  and mappings.names = 1
  and prints.product_name is distinct from mappings.product_name;

-- A small number of legacy official ids do not share the printed set prefix.
-- Apply the same unique-name rule using the printed card-number prefix.
with base as (
  select id,
    upper(regexp_replace(split_part(card_number, ' ', 1), '[-_]', '', 'g')) card_set,
    upper(regexp_replace(split_part(product_name, ' ', 1), '[-_]', '', 'g')) product_set
  from public.card_prints
), mappings as (
  select card_set, min(product_name) product_name, count(distinct product_name) names
  from public.card_prints prints
  join base on base.id = prints.id
  where base.card_set = base.product_set
  group by card_set
)
update public.card_prints prints
set product_name = mappings.product_name, updated_at = pg_catalog.now()
from base join mappings using (card_set)
where prints.id = base.id
  and mappings.names = 1
  and prints.product_name is distinct from mappings.product_name;

with source(official_url, official_card_id, image_key, image_width, image_height, image_byte_size) as (values
  ('https://dm.takaratomy.co.jp/card/detail/?id=dmrp07-s06$', 'dmrp07-s06$', 'official/dmrp07-s06_dollar_', 384, 536, 59928),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-001', 'dm34+1s-001', 'official/dm34_plus_1s-001', 384, 537, 49014),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-002', 'dm34+1s-002', 'official/dm34_plus_1s-002', 384, 537, 54404),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-003', 'dm34+1s-003', 'official/dm34_plus_1s-003', 384, 537, 45328),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm29+1d-003', 'dm29+1d-003', 'official/dm29_plus_1d-003', 384, 537, 47956),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm29+1d-002', 'dm29+1d-002', 'official/dm29_plus_1d-002', 384, 537, 45972),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm29+1d-001', 'dm29+1d-001', 'official/dm29_plus_1d-001', 384, 537, 46236),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm27+1d-001', 'dm27+1d-001', 'official/dm27_plus_1d-001', 384, 537, 51336),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm27+1d-002', 'dm27+1d-002', 'official/dm27_plus_1d-002', 384, 537, 40194),
  ('https://dm.takaratomy.co.jp/card/detail/?id=dm27+1d-003', 'dm27+1d-003', 'official/dm27_plus_1d-003', 384, 537, 46646)
)
update public.card_prints prints
set official_card_id = source.official_card_id,
    image_key = source.image_key,
    image_width = source.image_width,
    image_height = source.image_height,
    image_byte_size = source.image_byte_size,
    image_updated_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
from source
where prints.official_url = source.official_url;
