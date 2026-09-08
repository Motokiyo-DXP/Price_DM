create or replace function private.start_game_room_from_ready(p_room_id uuid)
returns table(state jsonb, state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_active_player text;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.guest_user_id is null
     or not v_room.host_ready or not v_room.guest_ready
     or v_room.status <> 'ready' then
    raise exception 'room_not_startable' using errcode = 'P0002';
  end if;

  v_active_player := case when pg_catalog.random() < 0.5 then 'p1' else 'p2' end;
  v_state := pg_catalog.jsonb_build_object(
    'players', pg_catalog.jsonb_build_object(
      'p1', private.build_online_player_state(v_room.host_deck_snapshot, 'p1'),
      'p2', private.build_online_player_state(v_room.guest_deck_snapshot, 'p2')
    ),
    'turn', 1,
    'activePlayer', v_active_player,
    'shieldPlacementOrder', pg_catalog.jsonb_build_object('p1', 1, 'p2', 1),
    'notifications', '[]'::jsonb,
    'turnRequest', null,
    'inspection', null
  );

  return query update public.game_rooms as rooms
  set state = v_state, state_version = rooms.state_version + 1,
      status = 'playing', started_at = pg_catalog.now(), ended_at = null,
      winner_user_id = null, end_reason = null,
      host_rematch_ready = false, guest_rematch_ready = false,
      updated_at = pg_catalog.now()
  where rooms.id = p_room_id
  returning rooms.state, rooms.state_version;
end;
$$;

revoke all on function private.start_game_room_from_ready(uuid) from public, anon, authenticated;

create or replace function private.start_game_room_impl(p_room_id uuid)
returns table(state jsonb, state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_host_user_id uuid;
begin
  select rooms.host_user_id into v_host_user_id
  from public.game_rooms as rooms
  where rooms.id = p_room_id;
  if not found or v_user_id is null or v_host_user_id <> v_user_id then
    raise exception 'room_not_startable' using errcode = 'P0002';
  end if;

  return query
  select started.state, started.state_version
  from private.start_game_room_from_ready(p_room_id) as started;
end;
$$;

revoke all on function private.start_game_room_impl(uuid) from public, anon, authenticated;
grant execute on function private.start_game_room_impl(uuid) to authenticated;

create or replace function public.set_game_room_ready(
  p_room_id uuid,
  p_deck_id uuid,
  p_ready boolean
)
returns table(status text, host_ready boolean, guest_ready boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status not in ('waiting', 'ready') then
    raise exception 'room_not_readyable' using errcode = 'P0002';
  end if;
  if v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
  if v_snapshot ->> 'format' <> v_room.format then
    raise exception 'deck_format_mismatch' using errcode = '23514';
  end if;

  update public.game_rooms as rooms
  set host_ready = case when v_user_id = rooms.host_user_id then p_ready else rooms.host_ready end,
      guest_ready = case when v_user_id = rooms.guest_user_id then p_ready else rooms.guest_ready end,
      host_deck_snapshot = case when v_user_id = rooms.host_user_id then v_snapshot else rooms.host_deck_snapshot end,
      guest_deck_snapshot = case when v_user_id = rooms.guest_user_id then v_snapshot else rooms.guest_deck_snapshot end,
      status = case
        when rooms.guest_user_id is not null
         and (case when v_user_id = rooms.host_user_id then p_ready else rooms.host_ready end)
         and (case when v_user_id = rooms.guest_user_id then p_ready else rooms.guest_ready end)
        then 'ready'
        else 'waiting'
      end,
      state_version = rooms.state_version + 1,
      updated_at = pg_catalog.now()
  where rooms.id = p_room_id;

  select rooms.status, rooms.host_ready, rooms.guest_ready
  into status, host_ready, guest_ready
  from public.game_rooms as rooms
  where rooms.id = p_room_id;

  if status = 'ready' then
    perform 1 from private.start_game_room_from_ready(p_room_id);
    status := 'playing';
  end if;

  return next;
end;
$$;

revoke all on function public.set_game_room_ready(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_game_room_ready(uuid, uuid, boolean) to authenticated;
