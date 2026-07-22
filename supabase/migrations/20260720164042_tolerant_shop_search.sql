-- Tolerant approved-shop search with optional readings and alternate names.
-- Existing migrations remain immutable; this extends the current shop master.

alter table public.shops
  add column if not exists name_kana text;

alter table public.shops
  add column if not exists aliases text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'shops_name_kana_length_check'
      and conrelid = 'public.shops'::pg_catalog.regclass
  ) then
    alter table public.shops
      add constraint shops_name_kana_length_check
      check (name_kana is null or pg_catalog.char_length(name_kana) <= 200);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'shops_aliases_count_check'
      and conrelid = 'public.shops'::pg_catalog.regclass
  ) then
    alter table public.shops
      add constraint shops_aliases_count_check
      check (pg_catalog.cardinality(aliases) <= 20);
  end if;
end
$$;

create or replace function public.normalize_shop_search(p_value text)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  v_value text := pg_catalog.lower(coalesce(p_value, ''));
begin
  -- A small verified lexicon covers common shop-name kanji already in the
  -- master. Uncommon or future names use shops.name_kana / shops.aliases.
  v_value := pg_catalog.replace(v_value, 'flat', 'ふらっと');
  v_value := pg_catalog.replace(v_value, '秋葉原', 'あきはばら');
  v_value := pg_catalog.replace(v_value, '秘密基地', 'ひみつきち');
  v_value := pg_catalog.replace(v_value, 'ラジオ会館', 'らじおかいかん');
  v_value := pg_catalog.replace(v_value, '会館', 'かいかん');
  v_value := pg_catalog.replace(v_value, '買取センター', 'かいとりせんたー');
  v_value := pg_catalog.replace(v_value, '駅前', 'えきまえ');
  v_value := pg_catalog.replace(v_value, '本店', 'ほんてん');
  v_value := pg_catalog.replace(v_value, '別館', 'べっかん');
  v_value := pg_catalog.replace(v_value, '工房', 'こうぼう');
  v_value := pg_catalog.replace(v_value, '福福', 'ふくふく');
  v_value := pg_catalog.replace(v_value, '商会', 'しょうかい');
  v_value := pg_catalog.replace(v_value, '遊亜王', 'ゆうあおう');
  v_value := pg_catalog.replace(v_value, '竜星', 'りゅうせい');
  v_value := pg_catalog.replace(v_value, '無線', 'むせん');
  v_value := pg_catalog.replace(v_value, '晴れる屋', 'はれるや');
  v_value := pg_catalog.replace(v_value, '東京', 'とうきょう');
  v_value := pg_catalog.replace(v_value, '宮殿', 'きゅうでん');
  v_value := pg_catalog.replace(v_value, '大明神', 'だいみょうじん');
  v_value := pg_catalog.replace(v_value, '買賊王', 'かいぞくおう');
  v_value := pg_catalog.replace(v_value, '梟', 'ふくろう');
  v_value := pg_catalog.replace(v_value, '書庫', 'しょこ');
  v_value := pg_catalog.replace(v_value, '買取', 'かいとり');
  v_value := pg_catalog.replace(v_value, '号', 'ごう');
  v_value := pg_catalog.replace(v_value, '番', 'ばん');
  v_value := pg_catalog.replace(v_value, '店', 'てん');
  v_value := pg_catalog.replace(v_value, '館', 'かん');

  v_value := pg_catalog.translate(
    v_value,
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ'
  );

  return pg_catalog.regexp_replace(
    v_value,
    '[[:space:]・･·‐‑‒–—―−－ーｰ-]',
    '',
    'g'
  );
end;
$$;

comment on function public.normalize_shop_search(text) is
  'Normalizes shop search by folding kana, common verified kanji readings, flat, spaces, dots, and hyphens.';

create index if not exists shops_normalized_name_trgm_idx
  on public.shops using gin (
    public.normalize_shop_search(name) extensions.gin_trgm_ops
  );

create index if not exists shops_normalized_name_kana_trgm_idx
  on public.shops using gin (
    public.normalize_shop_search(name_kana) extensions.gin_trgm_ops
  );

create index if not exists shops_prefecture_idx
  on public.shops (prefecture);

create or replace function public.search_shops(
  p_query text default '',
  p_limit integer default 20
)
returns table (id bigint, name text)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select public.normalize_shop_search(p_query) as query
  )
  select shops.id, shops.name
  from public.shops as shops
  cross join input
  where
    input.query = ''
    or public.normalize_shop_search(shops.name) like '%' || input.query || '%'
    or public.normalize_shop_search(shops.name_kana) like '%' || input.query || '%'
    or exists (
      select 1
      from pg_catalog.unnest(shops.aliases) as alias_name
      where public.normalize_shop_search(alias_name) like '%' || input.query || '%'
    )
  order by
    (public.normalize_shop_search(shops.name) = input.query) desc,
    (public.normalize_shop_search(shops.name) like input.query || '%') desc,
    shops.name,
    shops.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.search_shops(text, integer) from public;
grant execute on function public.search_shops(text, integer) to anon, authenticated;

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
  where
    (
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

revoke all on function public.search_shops_by_prefecture(text, text, integer)
  from public;
grant execute on function public.search_shops_by_prefecture(text, text, integer)
  to anon, authenticated;

-- Preserve the established audited direct-registration function and layer
-- optional search metadata on top of it.
create function private.create_shop_for_admin_with_search(
  p_name text,
  p_prefecture text,
  p_name_kana text default null,
  p_aliases text[] default '{}'::text[],
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null,
  p_review_note text default null
)
returns table (
  shop_id bigint,
  shop_name text,
  prefecture text,
  municipality text,
  address_line text,
  website_url text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop_id bigint;
  v_shop_name text;
  v_prefecture text;
  v_municipality text;
  v_address_line text;
  v_website_url text;
  v_name_kana text := nullif(pg_catalog.btrim(coalesce(p_name_kana, '')), '');
  v_aliases text[];
begin
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
      select 1
      from pg_catalog.unnest(v_aliases) as alias_name
      where pg_catalog.char_length(alias_name) > 200
    ) then
    raise exception 'invalid_shop_search_metadata';
  end if;

  select
    registered.shop_id,
    registered.shop_name,
    registered.prefecture,
    registered.municipality,
    registered.address_line,
    registered.website_url
  into
    v_shop_id,
    v_shop_name,
    v_prefecture,
    v_municipality,
    v_address_line,
    v_website_url
  from private.create_shop_for_admin(
    p_name,
    p_prefecture,
    p_municipality,
    p_address_line,
    p_website_url,
    p_review_note
  ) as registered;

  update public.shops as shops
  set name_kana = v_name_kana,
      aliases = v_aliases
  where shops.id = v_shop_id;

  return query select
    v_shop_id,
    v_shop_name,
    v_prefecture,
    v_municipality,
    v_address_line,
    v_website_url;
end;
$$;

revoke all on function private.create_shop_for_admin_with_search(
  text, text, text, text[], text, text, text, text
) from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.create_shop_for_admin_with_search(
  text, text, text, text[], text, text, text, text
) to authenticated;

create function public.create_shop_for_admin_with_search(
  p_name text,
  p_prefecture text,
  p_name_kana text default null,
  p_aliases text[] default '{}'::text[],
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null,
  p_review_note text default null
)
returns table (
  shop_id bigint,
  shop_name text,
  prefecture text,
  municipality text,
  address_line text,
  website_url text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.create_shop_for_admin_with_search(
    p_name,
    p_prefecture,
    p_name_kana,
    p_aliases,
    p_municipality,
    p_address_line,
    p_website_url,
    p_review_note
  );
$$;

revoke all on function public.create_shop_for_admin_with_search(
  text, text, text, text[], text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_shop_for_admin_with_search(
  text, text, text, text[], text, text, text, text
) to authenticated;

comment on function public.create_shop_for_admin_with_search(
  text, text, text, text[], text, text, text, text
) is
  'Registers an approved shop with optional reading and search aliases for an allowlisted administrator.';

-- The requested English reading is explicitly verified instead of attempting
-- unreliable general-purpose English-to-katakana conversion.
update public.shops
set name_kana = 'ふらっとこうぼう あきはばらてん',
    aliases = array['フラット工房']::text[]
where name = 'flat工房 秋葉原店';
