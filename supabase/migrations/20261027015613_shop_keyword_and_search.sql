-- Normalize on shop writes, not once per keyword per row on every lookup.
-- Spaces are inserted AFTER normalization so a keyword cannot bridge fields/aliases.
create function public.shop_search_document(
  p_name text, p_name_kana text, p_aliases text[], p_municipality text
)
returns text language sql immutable parallel safe security invoker set search_path = ''
as $$
  select public.normalize_shop_search(p_name) || ' ' ||
    public.normalize_shop_search(p_name_kana) || ' ' ||
    public.normalize_shop_search(p_municipality) || ' ' ||
    coalesce((select pg_catalog.string_agg(public.normalize_shop_search(alias_name), ' ')
      from pg_catalog.unnest(p_aliases) as alias_name), '');
$$;

alter table public.shops add column search_document text generated always as (
  public.shop_search_document(name, name_kana, aliases, municipality)
) stored;

-- Split raw input first, normalize each keyword, then require all keywords.
create or replace function public.search_shops_page(
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
    -- Canonical token order keeps ranking identical when keywords are reversed.
    select coalesce(pg_catalog.string_agg(keyword, '' order by keyword), '') as query,
      coalesce(pg_catalog.array_agg('%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(keyword, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' order by keyword), '{}'::text[]) as patterns
    from (
      select distinct public.normalize_shop_search(part) as keyword
      from pg_catalog.regexp_split_to_table(coalesce(p_query, ''), '[[:space:]　]+') as part
    ) as split
    where keyword <> ''
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
      and shops.search_document like all (input.patterns)
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


-- Keep the older lookup entry points consistent, including active-shop filtering.
create or replace function public.search_shops_by_prefecture(
  p_query text default '', p_prefecture text default null, p_limit integer default 20
)
returns table (id bigint, name text, prefecture text, municipality text)
language sql stable security invoker set search_path = ''
as $$
  select id, name, prefecture, municipality
  from public.search_shops_page(p_query, p_prefecture, p_limit, 0);
$$;

create or replace function public.search_shops(p_query text default '', p_limit integer default 20)
returns table (id bigint, name text)
language sql stable security invoker set search_path = ''
as $$
  select id, name from public.search_shops_page(p_query, null, p_limit, 0);
$$;

-- CREATE OR REPLACE retains existing ownership and EXECUTE ACLs. No RLS changes.
