create table public.game_room_presence (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_role text not null,
  last_seen_at timestamptz not null default pg_catalog.now(),
  primary key (room_id, user_id),
  constraint game_room_presence_role_check check (connection_role in ('host', 'guest', 'spectator'))
);

alter table public.game_room_presence enable row level security;
revoke all on public.game_room_presence from public, anon, authenticated;

create or replace function public.touch_game_room_presence(p_room_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select case
    when rooms.host_user_id = v_user_id then 'host'
    when rooms.guest_user_id = v_user_id then 'guest'
    when exists (
      select 1 from public.game_room_spectators as spectators
      where spectators.room_id = rooms.id and spectators.user_id = v_user_id
    ) then 'spectator'
  end into v_role
  from public.game_rooms as rooms
  where rooms.id = p_room_id;
  if v_role is null then raise exception 'room_access_denied' using errcode = '42501'; end if;
  insert into public.game_room_presence(room_id, user_id, connection_role, last_seen_at)
  values (p_room_id, v_user_id, v_role, pg_catalog.now())
  on conflict (room_id, user_id) do update
  set connection_role = excluded.connection_role, last_seen_at = excluded.last_seen_at;
end;
$$;

create or replace function public.list_game_room_presence(p_room_id uuid)
returns table(user_id uuid, display_name text, connection_role text, last_seen_at timestamptz, is_online boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.game_rooms as rooms
    where rooms.id = p_room_id and (
      rooms.host_user_id = v_user_id or rooms.guest_user_id = v_user_id
      or exists (
        select 1 from public.game_room_spectators as spectators
        where spectators.room_id = rooms.id and spectators.user_id = v_user_id
      )
    )
  ) then raise exception 'room_access_denied' using errcode = '42501'; end if;
  return query
  with room_users as (
    select rooms.host_user_id as member_id, 'host'::text as member_role
    from public.game_rooms as rooms where rooms.id = p_room_id
    union all
    select rooms.guest_user_id, 'guest'::text
    from public.game_rooms as rooms where rooms.id = p_room_id and rooms.guest_user_id is not null
    union all
    select spectators.user_id, 'spectator'::text
    from public.game_room_spectators as spectators where spectators.room_id = p_room_id
  )
  select room_users.member_id, profiles.display_name, room_users.member_role,
    presence.last_seen_at,
    coalesce(presence.last_seen_at >= pg_catalog.now() - interval '30 seconds', false)
  from room_users
  join public.profiles as profiles on profiles.user_id = room_users.member_id
  left join public.game_room_presence as presence
    on presence.room_id = p_room_id and presence.user_id = room_users.member_id
  order by case room_users.member_role when 'host' then 1 when 'guest' then 2 else 3 end, profiles.display_name;
end;
$$;

create or replace function public.list_resumable_game_rooms()
returns table(id uuid, room_code text, status text, member_role text, format text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select rooms.id, rooms.room_code, rooms.status,
    case
      when rooms.host_user_id = (select auth.uid()) then 'host'
      when rooms.guest_user_id = (select auth.uid()) then 'guest'
      else 'spectator'
    end,
    rooms.format, rooms.updated_at
  from public.game_rooms as rooms
  where rooms.status not in ('finished', 'cancelled')
    and rooms.expires_at > pg_catalog.now()
    and (
      rooms.host_user_id = (select auth.uid())
      or rooms.guest_user_id = (select auth.uid())
      or exists (
        select 1 from public.game_room_spectators as spectators
        where spectators.room_id = rooms.id and spectators.user_id = (select auth.uid())
      )
    )
  order by rooms.updated_at desc
  limit 10;
$$;

revoke all on function public.touch_game_room_presence(uuid) from public, anon;
revoke all on function public.list_game_room_presence(uuid) from public, anon;
revoke all on function public.list_resumable_game_rooms() from public, anon;
grant execute on function public.touch_game_room_presence(uuid) to authenticated;
grant execute on function public.list_game_room_presence(uuid) to authenticated;
grant execute on function public.list_resumable_game_rooms() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.game_room_presence;
exception when duplicate_object then null; end $$;
