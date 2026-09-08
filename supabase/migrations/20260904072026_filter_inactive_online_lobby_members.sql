create or replace function public.list_online_lobby_members(p_lobby_id uuid)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  member_role text,
  last_seen_at timestamptz,
  is_online boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.online_lobbies as lobbies
    where lobbies.id = p_lobby_id
      and (
        lobbies.kind = 'public'
        or exists (
          select 1
          from public.online_lobby_members as lobby_members
          where lobby_members.lobby_id = p_lobby_id
            and lobby_members.user_id = v_user_id
        )
      )
  ) then
    raise exception 'lobby_access_denied' using errcode = '42501';
  end if;

  return query
  select
    members.user_id,
    profiles.display_name,
    profiles.avatar_url,
    members.member_role,
    members.last_seen_at,
    members.last_seen_at >= pg_catalog.now() - interval '30 seconds'
  from public.online_lobby_members as members
  join public.profiles as profiles on profiles.user_id = members.user_id
  where members.lobby_id = p_lobby_id
    and (
      members.last_seen_at >= pg_catalog.now() - interval '30 seconds'
      or exists (
        select 1
        from public.online_match_slots as slots
        join public.game_rooms as rooms on rooms.id = slots.game_room_id
        where slots.lobby_id = p_lobby_id
          and rooms.status = 'playing'
          and (
            rooms.host_user_id = members.user_id
            or rooms.guest_user_id = members.user_id
            or exists (
              select 1
              from public.game_room_spectators as spectators
              where spectators.room_id = rooms.id
                and spectators.user_id = members.user_id
            )
          )
      )
    )
  order by (members.member_role = 'owner') desc, members.joined_at;
end;
$function$;

revoke all on function public.list_online_lobby_members(uuid) from public, anon;
grant execute on function public.list_online_lobby_members(uuid) to authenticated;
