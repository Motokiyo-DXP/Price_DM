-- Keep the existing name-only search RPC available for compatibility. This
-- region-aware variant returns only approved-shop fields needed by the
-- registration combobox and runs with the caller's RLS privileges.
create function public.search_shops_by_prefecture(
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
set search_path = public
as $$
  select
    shops.id,
    shops.name,
    shops.prefecture,
    shops.municipality
  from public.shops as shops
  where
    (
      nullif(pg_catalog.btrim(coalesce(p_prefecture, '')), '') is null
      or shops.prefecture = pg_catalog.btrim(p_prefecture)
    )
    and (
      pg_catalog.btrim(coalesce(p_query, '')) = ''
      or shops.name ilike '%' || pg_catalog.btrim(p_query) || '%'
    )
  order by
    case
      when shops.name ilike pg_catalog.btrim(coalesce(p_query, '')) || '%' then 0
      else 1
    end,
    shops.name,
    shops.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.search_shops_by_prefecture(text, text, integer)
  from public;
grant execute on function public.search_shops_by_prefecture(text, text, integer)
  to anon, authenticated;
