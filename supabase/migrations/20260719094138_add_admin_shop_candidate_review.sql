-- Administrator-only review boundary for shop candidates.
--
-- This migration intentionally keeps the existing public candidate-submission
-- boundary unchanged. The new functions require a verified Supabase Auth user
-- that has been provisioned in private.admin_users.

create table private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table private.admin_users enable row level security;
alter table private.admin_users force row level security;

revoke all on table private.admin_users
  from public, anon, authenticated, service_role, price_registration_executor;

alter table public.shop_candidates
  add column reviewed_by uuid references auth.users(id) on delete set null;

create index shop_candidates_reviewed_by_idx
  on public.shop_candidates(reviewed_by)
  where reviewed_by is not null;

create or replace function private.require_admin_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1
    from private.admin_users as admins
    where admins.user_id = v_user_id
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

create or replace function private.list_pending_shop_candidates_for_admin(
  p_limit integer default 50
)
returns table (
  id bigint,
  name text,
  prefecture text,
  municipality text,
  address_line text,
  website_url text,
  submission_count integer,
  submitted_at timestamptz,
  last_submitted_at timestamptz
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
    candidates.id,
    candidates.name,
    candidates.prefecture,
    candidates.municipality,
    candidates.address_line,
    candidates.website_url,
    candidates.submission_count,
    candidates.submitted_at,
    candidates.last_submitted_at
  from public.shop_candidates as candidates
  where candidates.status = 'pending'
  order by candidates.submitted_at asc, candidates.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function private.review_shop_candidate_for_admin(
  p_candidate_id bigint,
  p_decision text,
  p_review_note text default null
)
returns table (
  candidate_id bigint,
  candidate_status text,
  approved_shop_id bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_decision text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_shop_id bigint;
  v_candidate_id bigint;
  v_candidate_status text;
  v_approved_shop_id bigint;
begin
  v_admin_user_id := private.require_admin_user();

  if p_candidate_id is null or p_candidate_id <= 0 then
    raise exception 'invalid_shop_candidate';
  end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_review_decision';
  end if;

  if v_decision = 'approved' then
    v_shop_id := private.approve_shop_candidate(p_candidate_id, p_review_note);
  else
    perform private.reject_shop_candidate(p_candidate_id, p_review_note);
  end if;

  update public.shop_candidates as candidates
  set reviewed_by = v_admin_user_id
  where candidates.id = p_candidate_id
  returning
    candidates.id,
    candidates.status,
    candidates.approved_shop_id
  into v_candidate_id, v_candidate_status, v_approved_shop_id;

  return query
  select v_candidate_id, v_candidate_status, v_approved_shop_id;
end;
$$;

revoke all on function private.require_admin_user()
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on function private.list_pending_shop_candidates_for_admin(integer)
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on function private.review_shop_candidate_for_admin(bigint, text, text)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.list_pending_shop_candidates_for_admin(integer)
  to authenticated;
grant execute on function private.review_shop_candidate_for_admin(bigint, text, text)
  to authenticated;

create or replace function public.list_pending_shop_candidates_for_admin(
  p_limit integer default 50
)
returns table (
  id bigint,
  name text,
  prefecture text,
  municipality text,
  address_line text,
  website_url text,
  submission_count integer,
  submitted_at timestamptz,
  last_submitted_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.list_pending_shop_candidates_for_admin(p_limit);
$$;

create or replace function public.review_shop_candidate_for_admin(
  p_candidate_id bigint,
  p_decision text,
  p_review_note text default null
)
returns table (
  candidate_id bigint,
  candidate_status text,
  approved_shop_id bigint
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.review_shop_candidate_for_admin(
    p_candidate_id,
    p_decision,
    p_review_note
  );
$$;

revoke all on function public.list_pending_shop_candidates_for_admin(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.review_shop_candidate_for_admin(bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_pending_shop_candidates_for_admin(integer)
  to authenticated;
grant execute on function public.review_shop_candidate_for_admin(bigint, text, text)
  to authenticated;

comment on table private.admin_users is
  'Explicit allowlist of Supabase Auth users allowed to review shop candidates.';
comment on column public.shop_candidates.reviewed_by is
  'Supabase Auth user ID of the administrator who approved or rejected the candidate.';
comment on function public.list_pending_shop_candidates_for_admin(integer) is
  'Returns pending shop candidates only to explicitly provisioned administrators.';
comment on function public.review_shop_candidate_for_admin(bigint, text, text) is
  'Approves or rejects a shop candidate only for explicitly provisioned administrators.';
