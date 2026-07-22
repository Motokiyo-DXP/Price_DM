create function private.list_shop_search_metadata_for_admin(
  p_limit integer default 200
)
returns table (
  id bigint,
  name text,
  name_kana text,
  aliases text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_user();
  return query
  select shops.id, shops.name, shops.name_kana, shops.aliases
  from public.shops as shops
  order by shops.name, shops.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function private.list_shop_search_metadata_for_admin(integer)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.list_shop_search_metadata_for_admin(integer)
  to authenticated;

create function public.list_shop_search_metadata_for_admin(
  p_limit integer default 200
)
returns table (
  id bigint,
  name text,
  name_kana text,
  aliases text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_shop_search_metadata_for_admin(p_limit);
$$;

revoke all on function public.list_shop_search_metadata_for_admin(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_shop_search_metadata_for_admin(integer)
  to authenticated;

create function private.update_shop_search_metadata_for_admin(
  p_shop_id bigint,
  p_name_kana text default null,
  p_aliases text[] default '{}'::text[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name_kana text := nullif(pg_catalog.btrim(coalesce(p_name_kana, '')), '');
  v_aliases text[];
begin
  perform private.require_admin_user();
  if p_shop_id is null or p_shop_id <= 0 then raise exception 'invalid_shop'; end if;

  select coalesce(pg_catalog.array_agg(cleaned.alias order by cleaned.alias), '{}'::text[])
  into v_aliases
  from (
    select distinct pg_catalog.btrim(alias_name) as alias
    from pg_catalog.unnest(coalesce(p_aliases, '{}'::text[])) as alias_name
    where nullif(pg_catalog.btrim(alias_name), '') is not null
  ) as cleaned;

  if pg_catalog.char_length(coalesce(v_name_kana, '')) > 200
    or pg_catalog.cardinality(v_aliases) > 20
    or exists (
      select 1 from pg_catalog.unnest(v_aliases) as alias_name
      where pg_catalog.char_length(alias_name) > 200
    ) then
    raise exception 'invalid_shop_search_metadata';
  end if;

  update public.shops as shops
  set name_kana = v_name_kana, aliases = v_aliases
  where shops.id = p_shop_id;
  if not found then raise exception 'shop_not_found'; end if;
end;
$$;

revoke all on function private.update_shop_search_metadata_for_admin(bigint, text, text[])
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.update_shop_search_metadata_for_admin(bigint, text, text[])
  to authenticated;

create function public.update_shop_search_metadata_for_admin(
  p_shop_id bigint,
  p_name_kana text default null,
  p_aliases text[] default '{}'::text[]
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.update_shop_search_metadata_for_admin(p_shop_id, p_name_kana, p_aliases);
$$;

revoke all on function public.update_shop_search_metadata_for_admin(bigint, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.update_shop_search_metadata_for_admin(bigint, text, text[])
  to authenticated;
