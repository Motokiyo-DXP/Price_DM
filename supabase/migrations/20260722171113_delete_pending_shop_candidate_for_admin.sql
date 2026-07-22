-- Allow an allowlisted administrator to remove an accidentally submitted
-- pending shop candidate. Approved/rejected candidates and approved shops are
-- deliberately outside this operation. Preserve the deleted row privately.

create table private.shop_candidate_deletion_audit (
  id bigint generated always as identity primary key,
  candidate_id bigint not null,
  candidate_data jsonb not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default pg_catalog.now()
);

alter table private.shop_candidate_deletion_audit enable row level security;

revoke all on table private.shop_candidate_deletion_audit
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on sequence private.shop_candidate_deletion_audit_id_seq
  from public, anon, authenticated, service_role, price_registration_executor;

create policy "deny direct access to shop candidate deletion audit"
  on private.shop_candidate_deletion_audit
  for all
  to anon, authenticated
  using (false)
  with check (false);

create function private.delete_pending_shop_candidate_for_admin(
  p_candidate_id bigint
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_candidate public.shop_candidates%rowtype;
begin
  v_admin_user_id := private.require_admin_user();

  if p_candidate_id is null or p_candidate_id <= 0 then
    raise exception 'invalid_shop_candidate';
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
    raise exception 'shop_candidate_not_pending';
  end if;

  insert into private.shop_candidate_deletion_audit (
    candidate_id,
    candidate_data,
    deleted_by
  ) values (
    v_candidate.id,
    pg_catalog.to_jsonb(v_candidate),
    v_admin_user_id
  );

  delete from public.shop_candidates as candidates
  where candidates.id = v_candidate.id
    and candidates.status = 'pending';

  if not found then
    raise exception 'shop_candidate_not_pending';
  end if;

  return v_candidate.name;
end;
$$;

revoke all on function private.delete_pending_shop_candidate_for_admin(bigint)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.delete_pending_shop_candidate_for_admin(bigint)
  to authenticated;

create function public.delete_pending_shop_candidate_for_admin(
  p_candidate_id bigint
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.delete_pending_shop_candidate_for_admin(p_candidate_id);
$$;

revoke all on function public.delete_pending_shop_candidate_for_admin(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_pending_shop_candidate_for_admin(bigint)
  to authenticated;

comment on table private.shop_candidate_deletion_audit is
  'Private audit copy of pending shop candidates deleted by an administrator.';
comment on function public.delete_pending_shop_candidate_for_admin(bigint) is
  'Deletes only a pending shop candidate for an allowlisted administrator after recording a private audit copy.';
