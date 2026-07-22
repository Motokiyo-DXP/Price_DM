-- Let allowlisted administrators correct approved shop master data while
-- preserving a private before/after audit record for every change.

create table private.shop_update_audit (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shops(id) on delete restrict,
  changed_by uuid references auth.users(id) on delete set null,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_at timestamptz not null default pg_catalog.now()
);

alter table private.shop_update_audit enable row level security;

revoke all on table private.shop_update_audit
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on sequence private.shop_update_audit_id_seq
  from public, anon, authenticated, service_role, price_registration_executor;

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
  website_url text
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
    shops.website_url
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
  website_url text
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

create function private.update_shop_details_for_admin(
  p_shop_id bigint,
  p_name text,
  p_name_kana text default null,
  p_aliases text[] default '{}'::text[],
  p_prefecture text default null,
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_previous public.shops%rowtype;
  v_current public.shops%rowtype;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_name_kana text := nullif(pg_catalog.btrim(coalesce(p_name_kana, '')), '');
  v_aliases text[];
  v_prefecture text := pg_catalog.btrim(coalesce(p_prefecture, ''));
  v_municipality text := nullif(pg_catalog.btrim(coalesce(p_municipality, '')), '');
  v_address_line text := nullif(pg_catalog.btrim(coalesce(p_address_line, '')), '');
  v_website_url text := nullif(pg_catalog.btrim(coalesce(p_website_url, '')), '');
  v_name_key text;
begin
  v_admin_user_id := private.require_admin_user();

  if p_shop_id is null or p_shop_id <= 0 then
    raise exception 'invalid_shop';
  end if;

  select shops.*
  into v_previous
  from public.shops as shops
  where shops.id = p_shop_id
  for update;

  if not found then
    raise exception 'shop_not_found';
  end if;

  select coalesce(pg_catalog.array_agg(cleaned.alias order by cleaned.alias), '{}'::text[])
  into v_aliases
  from (
    select distinct pg_catalog.btrim(alias_name) as alias
    from pg_catalog.unnest(coalesce(p_aliases, '{}'::text[])) as alias_name
    where nullif(pg_catalog.btrim(alias_name), '') is not null
  ) as cleaned;

  if pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_shop_name';
  end if;
  if pg_catalog.char_length(coalesce(v_name_kana, '')) > 200
    or pg_catalog.cardinality(v_aliases) > 20
    or exists (
      select 1 from pg_catalog.unnest(v_aliases) as alias_name
      where pg_catalog.char_length(alias_name) > 200
    ) then
    raise exception 'invalid_shop_search_metadata';
  end if;
  if pg_catalog.char_length(v_prefecture) not between 1 and 20
    or not (
      v_prefecture = any(array[
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
      ]::text[])
    ) then
    raise exception 'invalid_prefecture';
  end if;
  if pg_catalog.char_length(coalesce(v_municipality, '')) > 100 then
    raise exception 'municipality_too_long';
  end if;
  if pg_catalog.char_length(coalesce(v_address_line, '')) > 300 then
    raise exception 'address_too_long';
  end if;
  if pg_catalog.char_length(coalesce(v_website_url, '')) > 500
    or (v_website_url is not null and v_website_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'invalid_website_url';
  end if;

  v_name_key := pg_catalog.lower(
    pg_catalog.regexp_replace(v_name, '[[:space:]　]+', '', 'g')
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_name_key, 0));

  if exists (
    select 1
    from public.shops as shops
    where shops.name_key = v_name_key
      and shops.id <> p_shop_id
  ) then
    raise exception 'shop_already_exists';
  end if;

  update public.shops as shops
  set
    name = v_name,
    name_kana = v_name_kana,
    aliases = v_aliases,
    prefecture = v_prefecture,
    municipality = v_municipality,
    address_line = v_address_line,
    website_url = v_website_url,
    updated_at = pg_catalog.now()
  where shops.id = p_shop_id
  returning shops.* into v_current;

  insert into private.shop_update_audit (
    shop_id,
    changed_by,
    previous_values,
    new_values
  ) values (
    p_shop_id,
    v_admin_user_id,
    pg_catalog.jsonb_build_object(
      'name', v_previous.name,
      'name_kana', v_previous.name_kana,
      'aliases', v_previous.aliases,
      'prefecture', v_previous.prefecture,
      'municipality', v_previous.municipality,
      'address_line', v_previous.address_line,
      'website_url', v_previous.website_url
    ),
    pg_catalog.jsonb_build_object(
      'name', v_current.name,
      'name_kana', v_current.name_kana,
      'aliases', v_current.aliases,
      'prefecture', v_current.prefecture,
      'municipality', v_current.municipality,
      'address_line', v_current.address_line,
      'website_url', v_current.website_url
    )
  );
end;
$$;

revoke all on function private.update_shop_details_for_admin(
  bigint, text, text, text[], text, text, text, text
) from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.update_shop_details_for_admin(
  bigint, text, text, text[], text, text, text, text
) to authenticated;

create function public.update_shop_details_for_admin(
  p_shop_id bigint,
  p_name text,
  p_name_kana text default null,
  p_aliases text[] default '{}'::text[],
  p_prefecture text default null,
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.update_shop_details_for_admin(
    p_shop_id,
    p_name,
    p_name_kana,
    p_aliases,
    p_prefecture,
    p_municipality,
    p_address_line,
    p_website_url
  );
$$;

revoke all on function public.update_shop_details_for_admin(
  bigint, text, text, text[], text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.update_shop_details_for_admin(
  bigint, text, text, text[], text, text, text, text
) to authenticated;

comment on table private.shop_update_audit is
  'Private before/after audit trail for administrator changes to approved shops.';
comment on function public.update_shop_details_for_admin(
  bigint, text, text, text[], text, text, text, text
) is
  'Updates approved shop master data for an allowlisted administrator and records an audit entry.';
