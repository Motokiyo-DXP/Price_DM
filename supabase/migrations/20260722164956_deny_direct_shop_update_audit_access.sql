-- The audit table is written only by the allowlisted administrator RPC.
-- Keep direct Data API access denied even if table grants change later.

create policy "deny direct access to shop update audit"
  on private.shop_update_audit
  for all
  to anon, authenticated
  using (false)
  with check (false);
