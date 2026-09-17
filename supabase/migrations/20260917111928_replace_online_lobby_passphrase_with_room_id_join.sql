create function public.join_online_lobby_by_code(p_join_code text)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_join_code text := pg_catalog.upper(pg_catalog.btrim(p_join_code));
  v_lobby_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if v_join_code !~ '^[A-F0-9]{6}$' then raise exception 'invalid_lobby_code' using errcode = '22023'; end if;

  select online_lobbies.id into v_lobby_id
  from public.online_lobbies
  where online_lobbies.join_code = v_join_code
    and online_lobbies.kind = 'private';
  if v_lobby_id is null then raise exception 'invalid_lobby_code' using errcode = 'P0002'; end if;

  insert into public.online_lobby_members(lobby_id, user_id)
  values (v_lobby_id, v_user_id)
  on conflict (lobby_id, user_id) do update set last_seen_at = pg_catalog.now();
  return query select v_lobby_id;
end;
$$;

drop function if exists public.set_online_lobby_passphrase(uuid, text);
drop function if exists public.join_online_lobby_with_passphrase(text, text);

revoke all on function public.join_online_lobby_by_code(text) from public, anon;
grant execute on function public.join_online_lobby_by_code(text) to authenticated;
