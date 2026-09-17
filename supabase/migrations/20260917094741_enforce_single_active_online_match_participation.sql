-- A user can actively participate in only one online match reception at a
-- time. Finished and cancelled rooms intentionally retain their player ids as
-- match history; active membership is represented by an active room status,
-- a current player seat, or a spectator row.

create or replace function private.leave_online_match_room(
  p_room_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.game_rooms%rowtype;
  v_is_host boolean;
  v_is_guest boolean;
begin
  select * into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    return;
  end if;

  v_is_host := v_room.host_user_id = p_user_id;
  v_is_guest := v_room.guest_user_id = p_user_id;

  -- A stale spectator row must not survive a player-seat transition either.
  delete from public.game_room_spectators
  where room_id = p_room_id
    and user_id = p_user_id;

  delete from public.game_room_presence
  where room_id = p_room_id
    and user_id = p_user_id;

  if v_is_host then
    if v_room.status = 'playing' then
      -- Reuse the established disconnect result shape while retaining the
      -- immutable room, board, and participant history.
      update public.game_rooms
      set status = 'finished',
          ended_at = pg_catalog.now(),
          winner_user_id = v_room.guest_user_id,
          end_reason = 'disconnect',
          updated_at = pg_catalog.now()
      where id = p_room_id;
    elsif v_room.status in ('waiting', 'ready') then
      -- host_user_id is intentionally non-nullable. Cancelling is the
      -- existing lifecycle-safe way to end an unstarted host room.
      update public.game_rooms
      set status = 'cancelled',
          updated_at = pg_catalog.now()
      where id = p_room_id;
    end if;
  elsif v_is_guest then
    if v_room.status = 'playing' then
      update public.game_rooms
      set status = 'finished',
          ended_at = pg_catalog.now(),
          winner_user_id = v_room.host_user_id,
          end_reason = 'disconnect',
          updated_at = pg_catalog.now()
      where id = p_room_id;
    elsif v_room.status in ('waiting', 'ready') then
      update public.game_rooms
      set guest_user_id = null,
          guest_deck_snapshot = null,
          guest_ready = false,
          status = 'waiting',
          state_version = state_version + 1,
          updated_at = pg_catalog.now()
      where id = p_room_id;
    end if;
  end if;
end;
$$;

revoke all on function private.leave_online_match_room(uuid, uuid) from public, anon, authenticated;

create or replace function public.enter_online_match_slot(
  p_slot_id uuid,
  p_role text,
  p_deck_id uuid,
  p_format text,
  p_time_limit_minutes smallint
)
returns table(game_room_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.online_match_slots%rowtype;
  v_locked_slot public.online_match_slots%rowtype;
  v_lobby public.online_lobbies%rowtype;
  v_target_room public.game_rooms%rowtype;
  v_locked_room public.game_rooms%rowtype;
  v_snapshot jsonb;
  v_code text;
  v_room_id uuid;
  v_attempt integer;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_role not in ('player', 'spectator') then raise exception 'invalid_match_role' using errcode = '22023'; end if;
  if p_format not in ('original', 'advanced') then raise exception 'invalid_format' using errcode = '22023'; end if;
  if p_time_limit_minutes not between 1 and 180 then raise exception 'invalid_time_limit' using errcode = '22023'; end if;

  -- Serializes every enter request for this account, including requests from
  -- separate browser tabs. It is released with this RPC transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select * into v_slot
  from public.online_match_slots
  where id = p_slot_id;
  if not found then raise exception 'match_slot_not_found' using errcode = 'P0002'; end if;

  select * into v_lobby from public.online_lobbies where id = v_slot.lobby_id;
  if v_lobby.kind <> 'public' and not exists (
    select 1 from public.online_lobby_members
    where lobby_id = v_lobby.id and user_id = v_user_id
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;

  -- Lock the target and every old active match slot in one stable order before
  -- their rooms. This also lets the public-slot release trigger update an old
  -- slot without deadlocking against another user entering it.
  for v_locked_slot in
    select slots.*
    from public.online_match_slots as slots
    left join public.game_rooms as rooms on rooms.id = slots.game_room_id
    where slots.id = p_slot_id
       or (
         rooms.status in ('waiting', 'ready', 'playing')
         and (
           rooms.host_user_id = v_user_id
           or rooms.guest_user_id = v_user_id
           or exists (
             select 1 from public.game_room_spectators as spectators
             where spectators.room_id = rooms.id
               and spectators.user_id = v_user_id
           )
         )
       )
    order by slots.id
    for update of slots
  loop
    if v_locked_slot.id = p_slot_id then
      v_slot := v_locked_slot;
    end if;
  end loop;

  -- Lock the corresponding rooms in a separate, stable order. This avoids a
  -- two-room deadlock when two users switch slots at the same time.
  for v_locked_room in
    select rooms.*
    from public.game_rooms as rooms
    join public.online_match_slots as slots on slots.game_room_id = rooms.id
    where slots.id = p_slot_id
       or (
         rooms.status in ('waiting', 'ready', 'playing')
         and (
           rooms.host_user_id = v_user_id
           or rooms.guest_user_id = v_user_id
           or exists (
             select 1 from public.game_room_spectators as spectators
             where spectators.room_id = rooms.id
               and spectators.user_id = v_user_id
           )
         )
       )
    order by rooms.id
    for update of rooms
  loop
    if v_locked_room.id = v_slot.game_room_id then
      v_target_room := v_locked_room;
    end if;
  end loop;

  -- Rejoining the exact same role/room is intentionally a no-op. A spectator
  -- asking for an available player seat is the one exception: it is a role
  -- change within the same room, not a new room creation.
  if v_target_room.id is not null
     and v_target_room.status not in ('finished', 'cancelled') then
    if v_target_room.host_user_id = v_user_id then
      return query select v_target_room.id, 'host'::text;
      return;
    end if;
    if v_target_room.guest_user_id = v_user_id then
      return query select v_target_room.id, 'guest'::text;
      return;
    end if;
    if p_role = 'spectator' and exists (
      select 1 from public.game_room_spectators
      where room_id = v_target_room.id and user_id = v_user_id
    ) then
      return query select v_target_room.id, 'spectator'::text;
      return;
    end if;
  end if;

  -- Do not touch the requested slot's current room. Every other active slot
  -- participation is released before the new seat or spectator row is made.
  for v_locked_room in
    select rooms.*
    from public.game_rooms as rooms
    join public.online_match_slots as slots on slots.game_room_id = rooms.id
    where slots.id <> p_slot_id
      and rooms.status in ('waiting', 'ready', 'playing')
      and (
        rooms.host_user_id = v_user_id
        or rooms.guest_user_id = v_user_id
        or exists (
          select 1 from public.game_room_spectators as spectators
          where spectators.room_id = rooms.id
            and spectators.user_id = v_user_id
        )
      )
    order by rooms.id
  loop
    perform private.leave_online_match_room(v_locked_room.id, v_user_id);
  end loop;

  insert into public.online_lobby_members(lobby_id, user_id)
  values (v_lobby.id, v_user_id)
  on conflict (lobby_id, user_id) do update set last_seen_at = pg_catalog.now();

  if v_slot.game_room_id is null
     or v_target_room.id is null
     or v_target_room.status in ('finished', 'cancelled') then
    if p_role = 'spectator' then raise exception 'match_not_started' using errcode = 'P0002'; end if;
    v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
    if v_snapshot ->> 'format' <> p_format then raise exception 'deck_format_mismatch' using errcode = '23514'; end if;
    for v_attempt in 1..10 loop
      v_code := private.make_online_lobby_code();
      begin
        insert into public.game_rooms(room_code, host_user_id, format, host_deck_snapshot)
        values (v_code, v_user_id, p_format, v_snapshot)
        returning id into v_room_id;
        exit;
      exception when unique_violation then
      end;
    end loop;
    if v_room_id is null then raise exception 'room_code_generation_failed' using errcode = 'P0001'; end if;
    update public.online_match_slots
    set game_room_id = v_room_id, format = p_format,
        time_limit_minutes = p_time_limit_minutes, updated_at = pg_catalog.now()
    where id = p_slot_id;
    return query select v_room_id, 'host'::text;
    return;
  end if;

  if p_role = 'player' and v_target_room.guest_user_id is null and v_target_room.status = 'waiting' then
    v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
    if v_snapshot ->> 'format' <> v_target_room.format then raise exception 'deck_format_mismatch' using errcode = '23514'; end if;
    delete from public.game_room_spectators
    where room_id = v_target_room.id and user_id = v_user_id;
    update public.game_rooms
    set guest_user_id = v_user_id, guest_deck_snapshot = v_snapshot,
        guest_ready = false, state_version = state_version + 1, updated_at = pg_catalog.now()
    where id = v_target_room.id;
    return query select v_target_room.id, 'guest'::text;
    return;
  end if;

  insert into public.game_room_spectators(room_id, user_id)
  values (v_target_room.id, v_user_id)
  on conflict (room_id, user_id) do update set last_seen_at = pg_catalog.now();
  return query select v_target_room.id, 'spectator'::text;
end;
$$;

revoke all on function public.enter_online_match_slot(uuid, text, uuid, text, smallint) from public, anon;
grant execute on function public.enter_online_match_slot(uuid, text, uuid, text, smallint) to authenticated;
