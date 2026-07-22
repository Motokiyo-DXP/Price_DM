-- Delete an accidentally registered shop only when no price history refers to
-- it. Preserve the shop, related candidate records and administrator identity
-- in a private audit trail before removing the approved shop row.

create table private.shop_deletion_audit (
  id bigint generated always as identity primary key,
  deleted_shop_id bigint not null,
  shop_data jsonb not null,
  candidate_data jsonb not null default '[]'::jsonb,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default pg_catalog.now()
);

alter table private.shop_deletion_audit enable row level security;

revoke all on table private.shop_deletion_audit
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on sequence private.shop_deletion_audit_id_seq
  from public, anon, authenticated, service_role, price_registration_executor;

create policy "deny direct access to shop deletion audit"
  on private.shop_deletion_audit
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Existing update audit entries must remain after their shop is removed. The
-- historical numeric ID is intentionally retained without a live foreign key.
alter table private.shop_update_audit
  drop constraint shop_update_audit_shop_id_fkey;

alter table public.shop_candidates
  drop constraint shop_candidates_status_check,
  drop constraint shop_candidates_review_state_check,
  drop constraint shop_candidates_approved_shop_id_fkey;

alter table public.shop_candidates
  add constraint shop_candidates_status_check
    check (status in ('pending', 'approved', 'rejected', 'deleted')),
  add constraint shop_candidates_review_state_check
    check (
      (status = 'pending' and reviewed_at is null and approved_shop_id is null)
      or (status = 'approved' and reviewed_at is not null and approved_shop_id is not null)
      or (status in ('rejected', 'deleted') and reviewed_at is not null and approved_shop_id is null)
    ),
  add constraint shop_candidates_approved_shop_id_fkey
    foreign key (approved_shop_id) references public.shops(id) on delete set null;

create function private.delete_registered_shop_for_admin(
  p_shop_id bigint
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_shop public.shops%rowtype;
  v_candidate_data jsonb;
begin
  v_admin_user_id := private.require_admin_user();

  if p_shop_id is null or p_shop_id <= 0 then
    raise exception 'invalid_shop';
  end if;

  select shops.*
  into v_shop
  from public.shops as shops
  where shops.id = p_shop_id
  for update;

  if not found then
    raise exception 'shop_not_found';
  end if;

  if exists (
    select 1
    from public.price_records as records
    where records.shop_id = p_shop_id
  ) then
    raise exception 'shop_has_price_records';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidates) order by candidates.id),
    '[]'::jsonb
  )
  into v_candidate_data
  from public.shop_candidates as candidates
  where candidates.approved_shop_id = p_shop_id;

  insert into private.shop_deletion_audit (
    deleted_shop_id,
    shop_data,
    candidate_data,
    deleted_by
  ) values (
    v_shop.id,
    pg_catalog.to_jsonb(v_shop),
    v_candidate_data,
    v_admin_user_id
  );

  update public.shop_candidates as candidates
  set
    status = 'deleted',
    approved_shop_id = null,
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_admin_user_id
  where candidates.approved_shop_id = p_shop_id;

  delete from public.shops as shops
  where shops.id = p_shop_id;

  if not found then
    raise exception 'shop_not_found';
  end if;

  return v_shop.name;
end;
$$;

revoke all on function private.delete_registered_shop_for_admin(bigint)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.delete_registered_shop_for_admin(bigint)
  to authenticated;

create function public.delete_registered_shop_for_admin(
  p_shop_id bigint
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.delete_registered_shop_for_admin(p_shop_id);
$$;

revoke all on function public.delete_registered_shop_for_admin(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_registered_shop_for_admin(bigint)
  to authenticated;

comment on table private.shop_deletion_audit is
  'Private audit copy of registered shops deleted by an administrator.';
comment on column private.shop_update_audit.shop_id is
  'Historical shop ID. The referenced shop may have been deleted after its update history was recorded.';
comment on function public.delete_registered_shop_for_admin(bigint) is
  'Deletes a registered shop with no price history for an allowlisted administrator after recording a private audit copy.';
