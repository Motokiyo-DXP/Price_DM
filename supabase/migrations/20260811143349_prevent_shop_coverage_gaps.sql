-- Make shop imports auditable, distinguish active and historical locations,
-- and provide count-aware pagination for both public search and admin review.

alter table public.shops
  add column chain_name text,
  add column source_store_id text,
  add column source_url text,
  add column source_verified_at timestamptz,
  add column operational_status text not null default 'active',
  add column superseded_by_shop_id bigint references public.shops(id) on delete restrict,
  add constraint shops_chain_name_length_check
    check (chain_name is null or pg_catalog.char_length(chain_name) between 1 and 200),
  add constraint shops_source_store_id_length_check
    check (source_store_id is null or pg_catalog.char_length(source_store_id) between 1 and 200),
  add constraint shops_source_url_check
    check (
      source_url is null
      or (
        pg_catalog.char_length(source_url) <= 500
        and source_url ~ '^https?://[^[:space:]]+$'
      )
    ),
  add constraint shops_operational_status_check
    check (operational_status in ('active', 'relocated', 'closed', 'online')),
  add constraint shops_superseded_by_other_shop_check
    check (superseded_by_shop_id is null or superseded_by_shop_id <> id);

create unique index shops_source_identity_idx
  on public.shops (
    pg_catalog.lower(chain_name),
    pg_catalog.lower(source_store_id)
  )
  where chain_name is not null and source_store_id is not null;

create index shops_operational_status_idx
  on public.shops(operational_status, name);

create index shops_superseded_by_shop_id_idx
  on public.shops(superseded_by_shop_id)
  where superseded_by_shop_id is not null;

comment on column public.shops.chain_name is
  'Canonical chain or operator name used to reconcile a checked-in source manifest.';
comment on column public.shops.source_store_id is
  'Stable store identifier within the source manifest; unique together with chain_name.';
comment on column public.shops.source_url is
  'Authoritative page used for the latest manual verification.';
comment on column public.shops.source_verified_at is
  'Time at which the source was last manually verified.';
comment on column public.shops.operational_status is
  'active, relocated, closed, or online. Public physical-store search returns active rows.';
comment on column public.shops.superseded_by_shop_id is
  'Current shop row that supersedes a relocated or duplicate historical row.';

with yellow_submarine_source(name, source_store_id) as (
  values
    ('イエローサブマリン 横浜店', 'yokohama'),
    ('イエローサブマリン 新宿店', 'shinjuku'),
    ('イエローサブマリン 池袋GAME SHOP', 'ikebukuro-game-shop'),
    ('イエローサブマリン 町田GAME SHOP', 'machida-game-shop'),
    ('イエローサブマリン 横浜西口店', 'yokohama-nishiguchi'),
    ('イエローサブマリン 川越カードショップ', 'kawagoe-card-shop'),
    ('イエローサブマリン 大宮本店・プレイソフト宮原店', 'omiya-miyahara'),
    ('イエローサブマリン 千葉ゲームショップ', 'chiba-game-shop'),
    ('イエローサブマリン 宇都宮店', 'utsunomiya'),
    ('イエローサブマリン 札幌GAME SHOP', 'sapporo-game-shop'),
    ('イエローサブマリン 秋葉原RPGショップ', 'akihabara-rpg-shop'),
    ('イエローサブマリン 秋葉原本店★ミント', 'akihabara-honten-mint'),
    ('イエローサブマリン 柏店', 'kashiwa'),
    ('イエローサブマリン 立川店', 'tachikawa'),
    ('イエローサブマリン 川崎店', 'kawasaki'),
    ('イエローサブマリン 溝口店', 'mizonokuchi'),
    ('イエローサブマリン 千葉店', 'chiba'),
    ('イエローサブマリン なんば本店', 'namba-honten'),
    ('イエローサブマリン 京都店', 'kyoto'),
    ('イエローサブマリン なんば店', 'namba'),
    ('イエローサブマリン 名古屋GAME SHOP', 'nagoya-game-shop'),
    ('イエローサブマリン 三宮店', 'sannomiya'),
    ('イエローサブマリン 姫路店', 'himeji'),
    ('イエローサブマリン マジッカーズ福岡店', 'magickers-fukuoka'),
    ('イエローサブマリン 広島店', 'hiroshima')
)
update public.shops as shops
set
  chain_name = 'イエローサブマリン',
  source_store_id = source.source_store_id,
  source_url = 'https://yellowsubmarine.co.jp/company/',
  source_verified_at = '2026-08-08 00:00:00+09'::timestamptz,
  operational_status = 'active',
  superseded_by_shop_id = null,
  updated_at = pg_catalog.now()
from yellow_submarine_source as source
where shops.name = source.name;

update public.shops as historical
set
  chain_name = 'イエローサブマリン',
  source_store_id = 'yokohama-moville-historical',
  source_url = 'https://yellowsubmarine.co.jp/company/',
  source_verified_at = '2026-08-08 00:00:00+09'::timestamptz,
  operational_status = 'relocated',
  superseded_by_shop_id = current_shop.id,
  updated_at = pg_catalog.now()
from public.shops as current_shop
where historical.name = 'イエローサブマリン 横浜ムービル店'
  and current_shop.name = 'イエローサブマリン 横浜店';

create or replace function public.search_shops_by_prefecture(
  p_query text default '',
  p_prefecture text default null,
  p_limit integer default 20
)
returns table (
  id bigint,
  name text,
  prefecture text,
  municipality text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select public.normalize_shop_search(p_query) as query
  )
  select
    shops.id,
    shops.name,
    shops.prefecture,
    shops.municipality
  from public.shops as shops
  cross join input
  where shops.operational_status = 'active'
    and (
      nullif(pg_catalog.btrim(coalesce(p_prefecture, '')), '') is null
      or shops.prefecture = pg_catalog.btrim(p_prefecture)
    )
    and (
      input.query = ''
      or public.normalize_shop_search(shops.name) like '%' || input.query || '%'
      or public.normalize_shop_search(shops.name_kana) like '%' || input.query || '%'
      or exists (
        select 1
        from pg_catalog.unnest(shops.aliases) as alias_name
        where public.normalize_shop_search(alias_name) like '%' || input.query || '%'
      )
    )
  order by
    (public.normalize_shop_search(shops.name) = input.query) desc,
    (public.normalize_shop_search(shops.name) like input.query || '%') desc,
    shops.name,
    shops.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create function public.search_shops_page(
  p_query text default '',
  p_prefecture text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id bigint,
  name text,
  prefecture text,
  municipality text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select public.normalize_shop_search(p_query) as query
  ),
  matching as (
    select
      shops.id,
      shops.name,
      shops.prefecture,
      shops.municipality,
      public.normalize_shop_search(shops.name) as normalized_name,
      input.query
    from public.shops as shops
    cross join input
    where shops.operational_status = 'active'
      and (
        nullif(pg_catalog.btrim(coalesce(p_prefecture, '')), '') is null
        or shops.prefecture = pg_catalog.btrim(p_prefecture)
      )
      and (
        input.query = ''
        or public.normalize_shop_search(shops.name) like '%' || input.query || '%'
        or public.normalize_shop_search(shops.name_kana) like '%' || input.query || '%'
        or exists (
          select 1
          from pg_catalog.unnest(shops.aliases) as alias_name
          where public.normalize_shop_search(alias_name) like '%' || input.query || '%'
        )
      )
  )
  select
    matching.id,
    matching.name,
    matching.prefecture,
    matching.municipality,
    pg_catalog.count(*) over () as total_count
  from matching
  order by
    (matching.normalized_name = matching.query) desc,
    (matching.normalized_name like matching.query || '%') desc,
    matching.name,
    matching.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_shops_page(text, text, integer, integer)
  from public;
grant execute on function public.search_shops_page(text, text, integer, integer)
  to anon, authenticated;

create function private.list_shop_details_page_for_admin(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id bigint,
  name text,
  name_kana text,
  aliases text[],
  prefecture text,
  municipality text,
  address_line text,
  website_url text,
  price_record_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_user();

  return query
  select
    shops.id,
    shops.name,
    shops.name_kana,
    coalesce(shops.aliases, '{}'::text[]),
    shops.prefecture,
    shops.municipality,
    shops.address_line,
    shops.website_url,
    (
      select pg_catalog.count(*)
      from public.price_records as records
      where records.shop_id = shops.id
    ) as price_record_count,
    pg_catalog.count(*) over () as total_count
  from public.shops as shops
  order by shops.name, shops.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function private.list_shop_details_page_for_admin(integer, integer)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.list_shop_details_page_for_admin(integer, integer)
  to authenticated;

create function public.list_shop_details_page_for_admin(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id bigint,
  name text,
  name_kana text,
  aliases text[],
  prefecture text,
  municipality text,
  address_line text,
  website_url text,
  price_record_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.list_shop_details_page_for_admin(p_limit, p_offset);
$$;

revoke all on function public.list_shop_details_page_for_admin(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_shop_details_page_for_admin(integer, integer)
  to authenticated;

comment on function public.search_shops_page(text, text, integer, integer) is
  'Returns one active approved-shop page and the complete match count.';
comment on function public.list_shop_details_page_for_admin(integer, integer) is
  'Returns one approved-shop admin page and the complete row count.';
