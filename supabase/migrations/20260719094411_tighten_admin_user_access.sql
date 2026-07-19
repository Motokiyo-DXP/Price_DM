-- Direct access remains unavailable: admin membership is only checked by
-- private.require_admin_user() inside security-definer review functions.
alter table private.admin_users
  drop column created_by;

create policy "deny direct access to admin users"
  on private.admin_users
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- reviewed_by is audit metadata; no current query filters on it.
drop index public.shop_candidates_reviewed_by_idx;
