alter table public.game_rooms
  add column time_limit_minutes smallint not null default 20,
  add column started_at timestamptz,
  add column ended_at timestamptz,
  add column winner_user_id uuid references auth.users(id) on delete set null,
  add column end_reason text,
  add column host_rematch_ready boolean not null default false,
  add column guest_rematch_ready boolean not null default false,
  add constraint game_rooms_time_limit_check check (time_limit_minutes between 1 and 180),
  add constraint game_rooms_end_reason_check check (
    end_reason is null or end_reason in ('surrender', 'time_limit', 'disconnect')
  );

create or replace function private.sync_match_slot_time_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.game_room_id is not null then
    update public.game_rooms
    set time_limit_minutes = new.time_limit_minutes
    where id = new.game_room_id;
  end if;
  return new;
end;
$$;

create trigger online_match_slots_sync_time_limit
after insert or update of game_room_id, time_limit_minutes on public.online_match_slots
for each row execute function private.sync_match_slot_time_limit();

update public.game_rooms as rooms
set time_limit_minutes = slots.time_limit_minutes
from public.online_match_slots as slots
where slots.game_room_id = rooms.id;

create or replace function public.reconcile_game_room_lifecycle(p_room_id uuid)
returns table(status text, winner_user_id uuid, end_reason text, deadline timestamptz, host_rematch_ready boolean, guest_rematch_ready boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_host_seen timestamptz;
  v_guest_seen timestamptz;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found' using errcode = 'P0002'; end if;
  if v_user_id is null or not (
    v_room.host_user_id = v_user_id or v_room.guest_user_id = v_user_id
    or exists (select 1 from public.game_room_spectators where room_id = p_room_id and user_id = v_user_id)
  ) then raise exception 'room_access_denied' using errcode = '42501'; end if;

  if v_room.status = 'playing' and v_room.started_at + pg_catalog.make_interval(mins => v_room.time_limit_minutes) <= pg_catalog.now() then
    update public.game_rooms set status = 'finished', ended_at = pg_catalog.now(),
      winner_user_id = null, end_reason = 'time_limit', updated_at = pg_catalog.now()
    where id = p_room_id;
  elsif v_room.status = 'playing' then
    select presence.last_seen_at into v_host_seen from public.game_room_presence as presence
    where presence.room_id = p_room_id and presence.user_id = v_room.host_user_id;
    select presence.last_seen_at into v_guest_seen from public.game_room_presence as presence
    where presence.room_id = p_room_id and presence.user_id = v_room.guest_user_id;
    if coalesce(v_host_seen, v_room.started_at) < pg_catalog.now() - interval '5 minutes'
       and coalesce(v_guest_seen, v_room.started_at) >= pg_catalog.now() - interval '30 seconds' then
      update public.game_rooms set status = 'finished', ended_at = pg_catalog.now(),
        winner_user_id = v_room.guest_user_id, end_reason = 'disconnect', updated_at = pg_catalog.now()
      where id = p_room_id;
    elsif coalesce(v_guest_seen, v_room.started_at) < pg_catalog.now() - interval '5 minutes'
       and coalesce(v_host_seen, v_room.started_at) >= pg_catalog.now() - interval '30 seconds' then
      update public.game_rooms set status = 'finished', ended_at = pg_catalog.now(),
        winner_user_id = v_room.host_user_id, end_reason = 'disconnect', updated_at = pg_catalog.now()
      where id = p_room_id;
    end if;
  end if;

  return query select rooms.status, rooms.winner_user_id, rooms.end_reason,
    case when rooms.started_at is null then null else rooms.started_at + pg_catalog.make_interval(mins => rooms.time_limit_minutes) end,
    rooms.host_rematch_ready, rooms.guest_rematch_ready
  from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

create or replace function public.surrender_game_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  update public.game_rooms
  set status = 'finished', ended_at = pg_catalog.now(),
      winner_user_id = case when host_user_id = v_user_id then guest_user_id else host_user_id end,
      end_reason = 'surrender', updated_at = pg_catalog.now()
  where id = p_room_id and status = 'playing'
    and (host_user_id = v_user_id or guest_user_id = v_user_id);
  if not found then raise exception 'room_not_surrenderable' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.request_game_room_rematch(p_room_id uuid)
returns table(status text, host_rematch_ready boolean, guest_rematch_ready boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  update public.game_rooms
  set host_rematch_ready = case when host_user_id = v_user_id then true else host_rematch_ready end,
      guest_rematch_ready = case when guest_user_id = v_user_id then true else guest_rematch_ready end,
      updated_at = pg_catalog.now()
  where id = p_room_id and status = 'finished'
    and (host_user_id = v_user_id or guest_user_id = v_user_id);
  if not found then raise exception 'rematch_not_available' using errcode = 'P0002'; end if;

  update public.game_rooms
  set status = 'ready', state = '{}'::jsonb, state_version = game_rooms.state_version + 1,
      started_at = null, ended_at = null, winner_user_id = null, end_reason = null,
      host_rematch_ready = false, guest_rematch_ready = false, updated_at = pg_catalog.now()
  where id = p_room_id and host_rematch_ready and guest_rematch_ready;

  return query select rooms.status, rooms.host_rematch_ready, rooms.guest_rematch_ready
  from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

revoke all on function public.reconcile_game_room_lifecycle(uuid) from public, anon;
revoke all on function public.surrender_game_room(uuid) from public, anon;
revoke all on function public.request_game_room_rematch(uuid) from public, anon;
grant execute on function public.reconcile_game_room_lifecycle(uuid) to authenticated;
grant execute on function public.surrender_game_room(uuid) to authenticated;
grant execute on function public.request_game_room_rematch(uuid) to authenticated;
