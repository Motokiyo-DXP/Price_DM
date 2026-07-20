-- Allow explicitly provisioned administrators to register an approved shop
-- directly while preserving the existing candidate-review audit trail.

create or replace function private.create_shop_for_admin(
  p_name text,
  p_prefecture text,
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
  v_admin_user_id uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_prefecture text := pg_catalog.btrim(coalesce(p_prefecture, ''));
  v_municipality text := nullif(pg_catalog.btrim(coalesce(p_municipality, '')), '');
  v_address_line text := nullif(pg_catalog.btrim(coalesce(p_address_line, '')), '');
  v_website_url text := nullif(pg_catalog.btrim(coalesce(p_website_url, '')), '');
  v_review_note text := nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '');
  v_name_key text;
  v_candidate_id bigint;
  v_shop_id bigint;
begin
  v_admin_user_id := private.require_admin_user();

  if pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_shop_name';
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
  if pg_catalog.char_length(coalesce(v_website_url, '')) > 500 then
    raise exception 'website_url_too_long';
  end if;
  if v_website_url is not null
    and v_website_url !~ '^https?://[^[:space:]]+$' then
    raise exception 'invalid_website_url';
  end if;
  if pg_catalog.char_length(coalesce(v_review_note, '')) > 2000 then
    raise exception 'review_note_too_long';
  end if;

  v_name_key := pg_catalog.lower(
    pg_catalog.regexp_replace(v_name, '[[:space:]　]+', '', 'g')
  );

  -- Serialize registrations with the same normalized name so two concurrent
  -- admin requests cannot create duplicate shops with spacing differences.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_name_key, 0)
  );

  if exists (
    select 1
    from public.shops as shops
    where shops.name_key = v_name_key
  ) then
    raise exception 'shop_already_exists';
  end if;

  if exists (
    select 1
    from public.shop_candidates as candidates
    where candidates.name_key = v_name_key
      and candidates.status = 'pending'
  ) then
    raise exception 'shop_candidate_pending';
  end if;

  insert into public.shop_candidates (
    name,
    prefecture,
    municipality,
    address_line,
    website_url
  ) values (
    v_name,
    v_prefecture,
    v_municipality,
    v_address_line,
    v_website_url
  )
  returning id into v_candidate_id;

  v_shop_id := private.approve_shop_candidate(
    v_candidate_id,
    coalesce(v_review_note, '管理者による直接登録')
  );

  update public.shop_candidates as candidates
  set reviewed_by = v_admin_user_id
  where candidates.id = v_candidate_id;

  return query
  select
    shops.id,
    shops.name,
    shops.prefecture,
    shops.municipality,
    shops.address_line,
    shops.website_url
  from public.shops as shops
  where shops.id = v_shop_id;
end;
$$;

revoke all on function private.create_shop_for_admin(
  text, text, text, text, text, text
) from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.create_shop_for_admin(
  text, text, text, text, text, text
) to authenticated;

create or replace function public.create_shop_for_admin(
  p_name text,
  p_prefecture text,
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
  from private.create_shop_for_admin(
    p_name,
    p_prefecture,
    p_municipality,
    p_address_line,
    p_website_url,
    p_review_note
  );
$$;

revoke all on function public.create_shop_for_admin(
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_shop_for_admin(
  text, text, text, text, text, text
) to authenticated;

comment on function public.create_shop_for_admin(
  text, text, text, text, text, text
) is
  'Registers an approved shop directly for an allowlisted administrator and records an approved candidate audit entry.';
