-- Canonical reconciliation for the active official card catalog.  This does
-- not replay 20260902120000's historical heuristics; it applies the current
-- official values only when a unique, unlocked target can be resolved.
begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('official-catalog-reconciliation-20260919', 0)
);

create temporary table official_image_source (
  official_card_id text primary key,
  official_url text not null,
  image_key text not null,
  image_width integer not null,
  image_height integer not null,
  image_byte_size integer not null
) on commit drop;

insert into official_image_source values
  ('dmrp07-s06$', 'https://dm.takaratomy.co.jp/card/detail/?id=dmrp07-s06$', 'official/dmrp07-s06_dollar_', 384, 536, 59928),
  ('dm34+1s-001', 'https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-001', 'official/dm34_plus_1s-001', 384, 537, 49014),
  ('dm34+1s-002', 'https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-002', 'official/dm34_plus_1s-002', 384, 537, 54404),
  ('dm34+1s-003', 'https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-003', 'official/dm34_plus_1s-003', 384, 537, 45328),
  ('dm29+1d-003', 'https://dm.takaratomy.co.jp/card/detail/?id=dm29+1d-003', 'official/dm29_plus_1d-003', 384, 537, 47956),
  ('dm29+1d-002', 'https://dm.takaratomy.co.jp/card/detail/?id=dm29+1d-002', 'official/dm29_plus_1d-002', 384, 537, 45972),
  ('dm29+1d-001', 'https://dm.takaratomy.co.jp/card/detail/?id=dm29+1d-001', 'official/dm29_plus_1d-001', 384, 537, 46236),
  ('dm27+1d-001', 'https://dm.takaratomy.co.jp/card/detail/?id=dm27+1d-001', 'official/dm27_plus_1d-001', 384, 537, 51336),
  ('dm27+1d-002', 'https://dm.takaratomy.co.jp/card/detail/?id=dm27+1d-002', 'official/dm27_plus_1d-002', 384, 537, 40194),
  ('dm27+1d-003', 'https://dm.takaratomy.co.jp/card/detail/?id=dm27+1d-003', 'official/dm27_plus_1d-003', 384, 537, 46646);

do $$
declare
  multiple_image_targets text;
  locked_image_conflicts text;
  card_target_count integer;
  product_target_count integer;
  locked_card_conflict boolean;
begin
  select string_agg(official_card_id, ', ' order by official_card_id)
    into multiple_image_targets
  from (
    select source.official_card_id
    from official_image_source source
    left join public.card_prints prints
      on lower(prints.official_card_id) = lower(source.official_card_id)
     and prints.deleted_at is null
    group by source.official_card_id
    having count(prints.id) > 1
  ) duplicates;

  if multiple_image_targets is not null then
    raise exception 'Official image reconciliation found multiple active prints: %', multiple_image_targets;
  end if;

  select string_agg(source.official_card_id, ', ' order by source.official_card_id)
    into locked_image_conflicts
  from official_image_source source
  join public.card_prints prints
    on lower(prints.official_card_id) = lower(source.official_card_id)
   and prints.deleted_at is null
  where prints.manually_locked
    and (prints.official_card_id, prints.official_url, prints.image_key,
         prints.image_width, prints.image_height, prints.image_byte_size)
      is distinct from
        (source.official_card_id, source.official_url, source.image_key,
         source.image_width, source.image_height, source.image_byte_size);

  if locked_image_conflicts is not null then
    raise exception 'Official image reconciliation would overwrite manually locked prints: %', locked_image_conflicts;
  end if;

  select count(*) into card_target_count
  from public.card_prints prints
  where lower(prints.official_card_id) = 'dmrp21-sp3'
    and prints.deleted_at is null;

  if card_target_count > 1 then
    raise exception 'Official catalog reconciliation found multiple active dmrp21-SP3 prints';
  end if;

  if card_target_count = 1 then
    select count(*) into product_target_count
    from public.card_products products
    join public.tcg_games game on game.id = products.game_id
    where game.slug = 'duel-masters'
      and products.product_code = 'DMRP21';

    if product_target_count <> 1 then
      raise exception 'Official catalog reconciliation requires exactly one Duel Masters DMRP21 product, found %', product_target_count;
    end if;

    select exists (
      select 1
      from public.card_prints prints
      join public.card_products products
        on products.product_code = 'DMRP21'
      join public.tcg_games game
        on game.id = products.game_id
       and game.slug = 'duel-masters'
      where lower(prints.official_card_id) = 'dmrp21-sp3'
        and prints.deleted_at is null
        and prints.manually_locked
        and (prints.official_card_id, prints.card_number, prints.product_name,
             prints.official_url, prints.product_id)
            is distinct from
            ('dmrp21-SP3'::text, 'DMRP21 SP3/SP5'::text, products.product_name,
             'https://dm.takaratomy.co.jp/card/detail/?id=dmrp21-SP3'::text,
             products.id)
    ) into locked_card_conflict;

    if locked_card_conflict then
      raise exception 'Official catalog reconciliation would overwrite manually locked dmrp21-SP3';
    end if;
  end if;
end $$;

update public.card_prints prints
set official_card_id = source.official_card_id,
    official_url = source.official_url,
    image_key = source.image_key,
    image_width = source.image_width,
    image_height = source.image_height,
    image_byte_size = source.image_byte_size,
    image_updated_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
from official_image_source source
where lower(prints.official_card_id) = lower(source.official_card_id)
  and prints.deleted_at is null
  and not prints.manually_locked
  and (prints.official_card_id, prints.official_url, prints.image_key,
       prints.image_width, prints.image_height, prints.image_byte_size)
      is distinct from
        (source.official_card_id, source.official_url, source.image_key,
         source.image_width, source.image_height, source.image_byte_size);

-- The official DMRP-22 and DMRP-21 product notices correct this print to the
-- DMRP-21 product and printed number.  This is deliberately an exact natural
-- key reconciliation, not the old prefix-based product-name rewrite.
update public.card_prints prints
set official_card_id = 'dmrp21-SP3',
    card_number = 'DMRP21 SP3/SP5',
    product_name = products.product_name,
    official_url = 'https://dm.takaratomy.co.jp/card/detail/?id=dmrp21-SP3',
    product_id = products.id,
    updated_at = pg_catalog.now()
from public.card_products products
join public.tcg_games game on game.id = products.game_id
where game.slug = 'duel-masters'
  and products.product_code = 'DMRP21'
  and lower(prints.official_card_id) = 'dmrp21-sp3'
  and prints.deleted_at is null
  and not prints.manually_locked
  and (prints.official_card_id, prints.card_number, prints.product_name,
       prints.official_url, prints.product_id)
      is distinct from
        ('dmrp21-SP3'::text, 'DMRP21 SP3/SP5'::text, products.product_name,
         'https://dm.takaratomy.co.jp/card/detail/?id=dmrp21-SP3'::text,
         products.id);

commit;
