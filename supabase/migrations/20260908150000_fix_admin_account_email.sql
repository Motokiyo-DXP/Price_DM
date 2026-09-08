-- Keep administrator authorization tied to the explicitly designated Auth
-- account, including when its user ID is recreated.
create or replace function private.require_admin_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not exists (
    select 1
    from auth.users as users
    where users.id = v_user_id
      and pg_catalog.lower(users.email) = 'mossan.sushi@gmail.com'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

revoke all on function private.require_admin_user()
  from public, anon, authenticated, service_role, price_registration_executor;
