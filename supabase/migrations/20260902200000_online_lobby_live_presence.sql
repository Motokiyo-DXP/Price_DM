create or replace function public.touch_online_lobby_presence(p_lobby_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.online_lobbies as lobbies where lobbies.id = p_lobby_id
    and (lobbies.kind = 'public' or exists (
      select 1 from public.online_lobby_members as lobby_members
      where lobby_members.lobby_id = p_lobby_id and lobby_members.user_id = v_user_id
    ))
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;
  insert into public.online_lobby_members(lobby_id, user_id, last_seen_at)
  values (p_lobby_id, v_user_id, pg_catalog.now())
  on conflict (lobby_id, user_id) do update set last_seen_at = excluded.last_seen_at;
  update public.online_lobbies
  set updated_at = pg_catalog.now(),
      expires_at = case when kind = 'private' then pg_catalog.now() + interval '15 minutes' else null end
  where id = p_lobby_id;
end;
$$;

create or replace function public.list_online_lobby_members(p_lobby_id uuid)
returns table(user_id uuid, display_name text, member_role text, last_seen_at timestamptz, is_online boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.online_lobbies as lobbies where lobbies.id = p_lobby_id
    and (lobbies.kind = 'public' or exists (
      select 1 from public.online_lobby_members as lobby_members
      where lobby_members.lobby_id = p_lobby_id and lobby_members.user_id = v_user_id
    ))
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;
  return query
  select members.user_id, profiles.display_name, members.member_role, members.last_seen_at,
    members.last_seen_at >= pg_catalog.now() - interval '30 seconds'
  from public.online_lobby_members as members
  join public.profiles as profiles on profiles.user_id = members.user_id
  where members.lobby_id = p_lobby_id
  order by (members.member_role = 'owner') desc, members.joined_at;
end;
$$;

revoke all on function public.touch_online_lobby_presence(uuid) from public, anon;
revoke all on function public.list_online_lobby_members(uuid) from public, anon;
grant execute on function public.touch_online_lobby_presence(uuid) to authenticated;
grant execute on function public.list_online_lobby_members(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.online_match_slots;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.online_lobby_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.game_rooms;
exception when duplicate_object then null; end $$;
