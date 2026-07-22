-- Show administrators whether an approved shop has price history before they
-- attempt deletion. The deletion RPC remains the final enforcement boundary.

drop function public.list_shop_details_for_admin(integer);
drop function private.list_shop_details_for_admin(integer);

create function private.list_shop_details_for_admin(
  p_limit integer default 200
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
  price_record_count bigint
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
    ) as price_record_count
  from public.shops as shops
  order by shops.name, shops.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function private.list_shop_details_for_admin(integer)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.list_shop_details_for_admin(integer)
  to authenticated;

create function public.list_shop_details_for_admin(
  p_limit integer default 200
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
  price_record_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_shop_details_for_admin(p_limit);
$$;

revoke all on function public.list_shop_details_for_admin(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_shop_details_for_admin(integer)
  to authenticated;

comment on function public.list_shop_details_for_admin(integer) is
  'Lists approved shop details and price record counts for an allowlisted administrator.';
