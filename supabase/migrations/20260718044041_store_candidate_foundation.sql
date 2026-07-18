-- Store master and candidate approval foundation.
--
-- public.shops is the approved store master after the registration cut-over.
-- A store proposed by a contributor can be kept in public.shop_candidates
-- until an administrator approves it. This migration intentionally does not
-- change the existing price-registration flow; the UI/RPC cut-over is handled
-- after this schema has been reviewed and applied.

alter table public.shops
  add column name_key text generated always as (
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(name),
        '[[:space:]　]+',
        '',
        'g'
      )
    )
  ) stored,
  add column prefecture text,
  add column municipality text,
  add column address_line text,
  add column website_url text,
  add column latitude numeric(9, 6),
  add column longitude numeric(10, 6),
  add column updated_at timestamptz not null default pg_catalog.now(),
  add constraint shops_prefecture_length_check
    check (prefecture is null or pg_catalog.char_length(prefecture) <= 20),
  add constraint shops_municipality_length_check
    check (municipality is null or pg_catalog.char_length(municipality) <= 100),
  add constraint shops_address_line_length_check
    check (address_line is null or pg_catalog.char_length(address_line) <= 300),
  add constraint shops_website_url_check
    check (
      website_url is null
      or (
        pg_catalog.char_length(website_url) <= 500
        and website_url ~ '^https?://'
      )
    ),
  add constraint shops_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  add constraint shops_longitude_range_check
    check (longitude is null or longitude between -180 and 180);

create index shops_name_key_idx on public.shops(name_key);
create index shops_region_idx
  on public.shops(prefecture, municipality)
  where prefecture is not null;

create table public.shop_candidates (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text generated always as (
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(name),
        '[[:space:]　]+',
        '',
        'g'
      )
    )
  ) stored,
  prefecture text,
  municipality text,
  address_line text,
  website_url text,
  status text not null default 'pending',
  submission_count integer not null default 1,
  submitted_at timestamptz not null default pg_catalog.now(),
  last_submitted_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz,
  review_note text,
  approved_shop_id bigint references public.shops(id) on delete restrict,
  constraint shop_candidates_name_length_check
    check (
      pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 200
    ),
  constraint shop_candidates_prefecture_length_check
    check (prefecture is null or pg_catalog.char_length(prefecture) <= 20),
  constraint shop_candidates_municipality_length_check
    check (municipality is null or pg_catalog.char_length(municipality) <= 100),
  constraint shop_candidates_address_line_length_check
    check (address_line is null or pg_catalog.char_length(address_line) <= 300),
  constraint shop_candidates_website_url_check
    check (
      website_url is null
      or (
        pg_catalog.char_length(website_url) <= 500
        and website_url ~ '^https?://'
      )
    ),
  constraint shop_candidates_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint shop_candidates_submission_count_check
    check (submission_count >= 1),
  constraint shop_candidates_review_note_length_check
    check (review_note is null or pg_catalog.char_length(review_note) <= 2000),
  constraint shop_candidates_review_state_check
    check (
      (status = 'pending' and reviewed_at is null and approved_shop_id is null)
      or (status = 'approved' and reviewed_at is not null and approved_shop_id is not null)
      or (status = 'rejected' and reviewed_at is not null and approved_shop_id is null)
    )
);

alter table public.shop_candidates enable row level security;
alter table public.shop_candidates force row level security;

create unique index shop_candidates_pending_name_key_idx
  on public.shop_candidates(name_key)
  where status = 'pending';
create index shop_candidates_status_submitted_idx
  on public.shop_candidates(status, submitted_at);
create index shop_candidates_approved_shop_id_idx
  on public.shop_candidates(approved_shop_id)
  where approved_shop_id is not null;

revoke all on table public.shop_candidates
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on sequence public.shop_candidates_id_seq
  from public, anon, authenticated, service_role, price_registration_executor;

grant select (id, name, name_key)
  on table public.shops
  to price_registration_executor;
grant select (
  id,
  name_key,
  status,
  submission_count,
  prefecture,
  municipality,
  address_line,
  website_url
) on table public.shop_candidates to price_registration_executor;
grant insert (
  name,
  prefecture,
  municipality,
  address_line,
  website_url
) on table public.shop_candidates to price_registration_executor;
grant update (
  submission_count,
  last_submitted_at,
  prefecture,
  municipality,
  address_line,
  website_url
) on table public.shop_candidates to price_registration_executor;
grant usage, select on sequence public.shop_candidates_id_seq
  to price_registration_executor;

create policy shop_candidates_registration_select
  on public.shop_candidates
  for select
  to price_registration_executor
  using (true);

create policy shop_candidates_registration_insert
  on public.shop_candidates
  for insert
  to price_registration_executor
  with check (status = 'pending');

create policy shop_candidates_registration_update
  on public.shop_candidates
  for update
  to price_registration_executor
  using (status = 'pending')
  with check (status = 'pending');

grant price_registration_executor to postgres with set true;
set role price_registration_executor;

create or replace function private.submit_shop_candidate_session_impl(
  p_session_token text,
  p_name text,
  p_prefecture text default null,
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_name_key text;
  v_candidate_id bigint;
  v_shop_id bigint;
begin
  if private.validate_registration_session_impl(p_session_token) is null then
    return pg_catalog.jsonb_build_object('status', 'invalid_session');
  end if;

  if pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_shop_name';
  end if;
  if pg_catalog.char_length(coalesce(p_prefecture, '')) > 20 then
    raise exception 'prefecture_too_long';
  end if;
  if pg_catalog.char_length(coalesce(p_municipality, '')) > 100 then
    raise exception 'municipality_too_long';
  end if;
  if pg_catalog.char_length(coalesce(p_address_line, '')) > 300 then
    raise exception 'address_too_long';
  end if;
  if pg_catalog.char_length(coalesce(p_website_url, '')) > 500 then
    raise exception 'website_url_too_long';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_website_url, '')), '') is not null
    and pg_catalog.btrim(p_website_url) !~ '^https?://' then
    raise exception 'invalid_website_url';
  end if;

  v_name_key := pg_catalog.lower(
    pg_catalog.regexp_replace(v_name, '[[:space:]　]+', '', 'g')
  );

  select shops.id
  into v_shop_id
  from public.shops as shops
  where shops.name_key = v_name_key
  order by shops.id
  limit 1;

  if v_shop_id is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_approved',
      'shop_id', v_shop_id
    );
  end if;

  insert into public.shop_candidates as candidates(
    name,
    prefecture,
    municipality,
    address_line,
    website_url
  ) values (
    v_name,
    nullif(pg_catalog.btrim(coalesce(p_prefecture, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_municipality, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_address_line, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_website_url, '')), '')
  )
  on conflict (name_key) where status = 'pending'
  do update set
    submission_count = candidates.submission_count + 1,
    last_submitted_at = pg_catalog.now(),
    prefecture = coalesce(excluded.prefecture, candidates.prefecture),
    municipality = coalesce(excluded.municipality, candidates.municipality),
    address_line = coalesce(excluded.address_line, candidates.address_line),
    website_url = coalesce(excluded.website_url, candidates.website_url)
  returning id into v_candidate_id;

  return pg_catalog.jsonb_build_object(
    'status', 'pending',
    'candidate_id', v_candidate_id
  );
end;
$$;

revoke all on function private.submit_shop_candidate_session_impl(
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function private.submit_shop_candidate_session_impl(
  text, text, text, text, text, text
) to anon, authenticated;

reset role;
revoke price_registration_executor from postgres granted by postgres;

create or replace function public.submit_shop_candidate_session(
  p_session_token text,
  p_name text,
  p_prefecture text default null,
  p_municipality text default null,
  p_address_line text default null,
  p_website_url text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_shop_candidate_session_impl(
    p_session_token,
    p_name,
    p_prefecture,
    p_municipality,
    p_address_line,
    p_website_url
  );
$$;

revoke all on function public.submit_shop_candidate_session(
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_shop_candidate_session(
  text, text, text, text, text, text
) to anon, authenticated;

create or replace function private.approve_shop_candidate(
  p_candidate_id bigint,
  p_review_note text default null
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_candidate public.shop_candidates%rowtype;
  v_shop_id bigint;
begin
  if pg_catalog.char_length(coalesce(p_review_note, '')) > 2000 then
    raise exception 'review_note_too_long';
  end if;

  select candidates.*
  into v_candidate
  from public.shop_candidates as candidates
  where candidates.id = p_candidate_id
  for update;

  if not found then
    raise exception 'shop_candidate_not_found';
  end if;
  if v_candidate.status <> 'pending' then
    raise exception 'shop_candidate_already_reviewed';
  end if;

  select shops.id
  into v_shop_id
  from public.shops as shops
  where shops.name_key = v_candidate.name_key
  order by shops.id
  limit 1;

  if v_shop_id is null then
    insert into public.shops(
      name,
      prefecture,
      municipality,
      address_line,
      website_url
    ) values (
      v_candidate.name,
      v_candidate.prefecture,
      v_candidate.municipality,
      v_candidate.address_line,
      v_candidate.website_url
    )
    returning id into v_shop_id;
  end if;

  update public.shop_candidates as candidates
  set status = 'approved',
      reviewed_at = pg_catalog.now(),
      review_note = nullif(pg_catalog.btrim(coalesce(p_review_note, '')), ''),
      approved_shop_id = v_shop_id
  where candidates.id = p_candidate_id;

  return v_shop_id;
end;
$$;

create or replace function private.reject_shop_candidate(
  p_candidate_id bigint,
  p_review_note text default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.char_length(coalesce(p_review_note, '')) > 2000 then
    raise exception 'review_note_too_long';
  end if;

  update public.shop_candidates as candidates
  set status = 'rejected',
      reviewed_at = pg_catalog.now(),
      review_note = nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '')
  where candidates.id = p_candidate_id
    and candidates.status = 'pending';

  if not found then
    if exists(
      select 1
      from public.shop_candidates as candidates
      where candidates.id = p_candidate_id
    ) then
      raise exception 'shop_candidate_already_reviewed';
    end if;
    raise exception 'shop_candidate_not_found';
  end if;
end;
$$;

revoke all on function private.approve_shop_candidate(bigint, text)
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on function private.reject_shop_candidate(bigint, text)
  from public, anon, authenticated, service_role, price_registration_executor;

comment on table public.shops is
  'Approved store master. New contributor proposals remain in shop_candidates until reviewed.';
comment on table public.shop_candidates is
  'Store proposals awaiting administrator approval. Not readable through public API roles.';
comment on function public.submit_shop_candidate_session(
  text, text, text, text, text, text
) is
  'Submits or refreshes a pending store candidate using an active registration PIN session.';
comment on function private.approve_shop_candidate(bigint, text) is
  'Administrator-only review operation. Creates or reuses an approved shop and closes the candidate.';
comment on function private.reject_shop_candidate(bigint, text) is
  'Administrator-only review operation. Rejects a pending store candidate.';
