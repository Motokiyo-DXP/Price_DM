-- Password hashes are server-only verification material and must never be
-- returned to authenticated browser clients.
revoke select on public.online_lobbies from authenticated;
grant select (id, kind, owner_user_id, join_code, created_at, updated_at, expires_at)
  on public.online_lobbies to authenticated;
