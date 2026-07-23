-- Contributors with a valid registration session may propose corrections to
-- approved shop data. Requests remain private until an allowlisted admin
-- reviews them. Approved changes reuse the existing audited shop update path.
create table public.shop_correction_requests (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shops(id) on delete restrict,
  proposed_name text,
  proposed_name_kana text,
  proposed_aliases text[],
  proposed_prefecture text,
  proposed_municipality text,
  proposed_address_line text,
  proposed_website_url text,
  reason text not null,
  status text not null default 'pending',
  submitted_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  constraint shop_correction_requests_name_length_check
    check (proposed_name is null or pg_catalog.char_length(proposed_name) between 1 and 200),
  constraint shop_correction_requests_name_kana_length_check
    check (proposed_name_kana is null or pg_catalog.char_length(proposed_name_kana) between 1 and 200),
  constraint shop_correction_requests_aliases_check
    check (
      proposed_aliases is null
      or pg_catalog.cardinality(proposed_aliases) between 1 and 20
    ),
  constraint shop_correction_requests_prefecture_length_check
    check (proposed_prefecture is null or pg_catalog.char_length(proposed_prefecture) between 1 and 20),
  constraint shop_correction_requests_municipality_length_check
    check (proposed_municipality is null or pg_catalog.char_length(proposed_municipality) between 1 and 100),
  constraint shop_correction_requests_address_length_check
    check (proposed_address_line is null or pg_catalog.char_length(proposed_address_line) between 1 and 300),
  constraint shop_correction_requests_website_check
    check (
      proposed_website_url is null
      or (
        pg_catalog.char_length(proposed_website_url) between 1 and 500
        and proposed_website_url ~ '^https?://[^[:space:]]+$'
      )
    ),
  constraint shop_correction_requests_reason_length_check
    check (pg_catalog.char_length(reason) between 1 and 2000),
  constraint shop_correction_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint shop_correction_requests_proposal_check
    check (
      pg_catalog.num_nonnulls(
        proposed_name,
        proposed_name_kana,
        proposed_aliases,
        proposed_prefecture,
        proposed_municipality,
        proposed_address_line,
        proposed_website_url
      ) > 0
    ),
  constraint shop_correction_requests_review_state_check
    check (
      (status = 'pending' and reviewed_at is null and reviewed_by is null)
      or (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
    )
);

create unique index shop_correction_requests_one_pending_per_shop_idx
  on public.shop_correction_requests(shop_id)
  where status = 'pending';

create index shop_correction_requests_shop_id_idx
  on public.shop_correction_requests(shop_id);

create index shop_correction_requests_pending_idx
  on public.shop_correction_requests(submitted_at, id)
  where status = 'pending';

create index shop_correction_requests_reviewed_by_idx
  on public.shop_correction_requests(reviewed_by)
  where reviewed_by is not null;

alter table public.shop_correction_requests enable row level security;
alter table public.shop_correction_requests force row level security;

revoke all on table public.shop_correction_requests
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on sequence public.shop_correction_requests_id_seq
  from public, anon, authenticated, service_role, price_registration_executor;

create policy "deny direct shop correction access"
  on public.shop_correction_requests
  as restrictive
  for all
  to public
  using (false)
  with check (false);

create function private.submit_shop_correction_request_impl(
  p_session_token text,
  p_shop_id bigint,
  p_name text default null,
  p_name_kana text default null,
  p_aliases text[] default null,
  p_prefecture text default null,
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null,
  p_reason text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
  v_request_id bigint;
  v_name text := nullif(pg_catalog.btrim(coalesce(p_name, '')), '');
  v_name_kana text := nullif(pg_catalog.btrim(coalesce(p_name_kana, '')), '');
  v_aliases text[];
  v_prefecture text := nullif(pg_catalog.btrim(coalesce(p_prefecture, '')), '');
  v_municipality text := nullif(pg_catalog.btrim(coalesce(p_municipality, '')), '');
  v_address_line text := nullif(pg_catalog.btrim(coalesce(p_address_line, '')), '');
  v_website_url text := nullif(pg_catalog.btrim(coalesce(p_website_url, '')), '');
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if p_session_token is null or pg_catalog.octet_length(p_session_token) > 128 then
    return -4;
  end if;

  select private.validate_registration_session_impl(p_session_token)
  into v_expires_at;
  if v_expires_at is null or v_expires_at <= pg_catalog.clock_timestamp() then
    return -4;
  end if;

  if p_shop_id is null or p_shop_id <= 0 or not exists (
    select 1 from public.shops where id = p_shop_id
  ) then
    return -5;
  end if;

  if p_aliases is not null then
    select coalesce(pg_catalog.array_agg(cleaned.alias order by cleaned.alias), '{}'::text[])
    into v_aliases
    from (
      select distinct pg_catalog.btrim(alias_name) as alias
      from pg_catalog.unnest(p_aliases) as alias_name
      where nullif(pg_catalog.btrim(alias_name), '') is not null
    ) as cleaned;
    if pg_catalog.cardinality(v_aliases) = 0 then
      v_aliases := null;
    end if;
  end if;

  if pg_catalog.char_length(coalesce(v_name, '')) > 200
    or pg_catalog.char_length(coalesce(v_name_kana, '')) > 200
    or pg_catalog.char_length(coalesce(v_prefecture, '')) > 20
    or pg_catalog.char_length(coalesce(v_municipality, '')) > 100
    or pg_catalog.char_length(coalesce(v_address_line, '')) > 300
    or pg_catalog.char_length(coalesce(v_website_url, '')) > 500
    or (v_website_url is not null and v_website_url !~ '^https?://[^[:space:]]+$')
    or pg_catalog.char_length(coalesce(v_reason, '')) not between 1 and 2000
    or pg_catalog.cardinality(coalesce(v_aliases, '{}'::text[])) > 20
    or exists (
      select 1 from pg_catalog.unnest(coalesce(v_aliases, '{}'::text[])) as alias_name
      where pg_catalog.char_length(alias_name) > 200
    )
    or pg_catalog.num_nonnulls(
      v_name, v_name_kana, v_aliases, v_prefecture, v_municipality,
      v_address_line, v_website_url
    ) = 0 then
    return -1;
  end if;

  insert into public.shop_correction_requests(
    shop_id,
    proposed_name,
    proposed_name_kana,
    proposed_aliases,
    proposed_prefecture,
    proposed_municipality,
    proposed_address_line,
    proposed_website_url,
    reason
  ) values (
    p_shop_id,
    v_name,
    v_name_kana,
    v_aliases,
    v_prefecture,
    v_municipality,
    v_address_line,
    v_website_url,
    v_reason
  ) returning id into v_request_id;

  return v_request_id;
exception
  when unique_violation then return -2;
end;
$$;

revoke all on function private.submit_shop_correction_request_impl(
  text, bigint, text, text, text[], text, text, text, text, text
) from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.submit_shop_correction_request_impl(
  text, bigint, text, text, text[], text, text, text, text, text
) to anon, authenticated;

create function public.submit_shop_correction_request(
  p_session_token text,
  p_shop_id bigint,
  p_name text default null,
  p_name_kana text default null,
  p_aliases text[] default null,
  p_prefecture text default null,
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null,
  p_reason text default null
)
returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_shop_correction_request_impl(
    p_session_token,
    p_shop_id,
    p_name,
    p_name_kana,
    p_aliases,
    p_prefecture,
    p_municipality,
    p_address_line,
    p_website_url,
    p_reason
  );
$$;

revoke all on function public.submit_shop_correction_request(
  text, bigint, text, text, text[], text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_shop_correction_request(
  text, bigint, text, text, text[], text, text, text, text, text
) to anon, authenticated;

create function private.list_pending_shop_corrections_for_admin(
  p_limit integer default 50
)
returns table (
  id bigint,
  shop_id bigint,
  original_name text,
  original_name_kana text,
  original_aliases text[],
  original_prefecture text,
  original_municipality text,
  original_address_line text,
  original_website_url text,
  proposed_name text,
  proposed_name_kana text,
  proposed_aliases text[],
  proposed_prefecture text,
  proposed_municipality text,
  proposed_address_line text,
  proposed_website_url text,
  reason text,
  submitted_at timestamptz
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
    requests.id,
    shops.id,
    shops.name,
    shops.name_kana,
    coalesce(shops.aliases, '{}'::text[]),
    shops.prefecture,
    shops.municipality,
    shops.address_line,
    shops.website_url,
    requests.proposed_name,
    requests.proposed_name_kana,
    requests.proposed_aliases,
    requests.proposed_prefecture,
    requests.proposed_municipality,
    requests.proposed_address_line,
    requests.proposed_website_url,
    requests.reason,
    requests.submitted_at
  from public.shop_correction_requests as requests
  join public.shops as shops on shops.id = requests.shop_id
  where requests.status = 'pending'
  order by requests.submitted_at, requests.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function private.list_pending_shop_corrections_for_admin(integer)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.list_pending_shop_corrections_for_admin(integer)
  to authenticated;

create function public.list_pending_shop_corrections_for_admin(
  p_limit integer default 50
)
returns table (
  id bigint,
  shop_id bigint,
  original_name text,
  original_name_kana text,
  original_aliases text[],
  original_prefecture text,
  original_municipality text,
  original_address_line text,
  original_website_url text,
  proposed_name text,
  proposed_name_kana text,
  proposed_aliases text[],
  proposed_prefecture text,
  proposed_municipality text,
  proposed_address_line text,
  proposed_website_url text,
  reason text,
  submitted_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_pending_shop_corrections_for_admin(p_limit);
$$;

revoke all on function public.list_pending_shop_corrections_for_admin(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_pending_shop_corrections_for_admin(integer)
  to authenticated;

create function private.review_shop_correction_for_admin(
  p_request_id bigint,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_request public.shop_correction_requests%rowtype;
  v_shop public.shops%rowtype;
begin
  v_admin_user_id := private.require_admin_user();

  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if pg_catalog.char_length(coalesce(p_review_note, '')) > 2000 then
    raise exception 'review_note_too_long' using errcode = '22023';
  end if;

  select requests.*
  into v_request
  from public.shop_correction_requests as requests
  where requests.id = p_request_id and requests.status = 'pending'
  for update;
  if not found then
    raise exception 'shop_correction_not_pending' using errcode = 'P0001';
  end if;

  if p_decision = 'approved' then
    select shops.*
    into v_shop
    from public.shops as shops
    where shops.id = v_request.shop_id
    for update;
    if not found then
      raise exception 'shop_not_found' using errcode = 'P0001';
    end if;

    perform private.update_shop_details_for_admin(
      v_shop.id,
      coalesce(v_request.proposed_name, v_shop.name),
      coalesce(v_request.proposed_name_kana, v_shop.name_kana),
      coalesce(v_request.proposed_aliases, v_shop.aliases, '{}'::text[]),
      coalesce(v_request.proposed_prefecture, v_shop.prefecture),
      coalesce(v_request.proposed_municipality, v_shop.municipality),
      coalesce(v_request.proposed_address_line, v_shop.address_line),
      coalesce(v_request.proposed_website_url, v_shop.website_url)
    );
  end if;

  update public.shop_correction_requests
  set
    status = p_decision,
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_admin_user_id,
    review_note = nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '')
  where id = v_request.id;
end;
$$;

revoke all on function private.review_shop_correction_for_admin(bigint, text, text)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.review_shop_correction_for_admin(bigint, text, text)
  to authenticated;

create function public.review_shop_correction_for_admin(
  p_request_id bigint,
  p_decision text,
  p_review_note text default null
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.review_shop_correction_for_admin(
    p_request_id,
    p_decision,
    p_review_note
  );
$$;

revoke all on function public.review_shop_correction_for_admin(bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_shop_correction_for_admin(bigint, text, text)
  to authenticated;

comment on table public.shop_correction_requests is
  'Private contributor proposals to correct approved shop master data.';
