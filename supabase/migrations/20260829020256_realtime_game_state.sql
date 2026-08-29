create or replace function public.start_game_room(
  p_room_id uuid,
  p_initial_state jsonb
)
returns table(state jsonb, state_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_initial_state) <> 'object'
     or not (p_initial_state ? 'players') then
    raise exception 'invalid_game_state' using errcode = '22023';
  end if;

  return query
  update public.game_rooms
  set state = p_initial_state,
      state_version = state_version + 1,
      status = 'playing',
      updated_at = pg_catalog.now()
  where id = p_room_id
    and host_user_id = v_user_id
    and status = 'ready'
  returning game_rooms.state, game_rooms.state_version;

  if not found then
    raise exception 'room_not_startable' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.update_game_room_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb
)
returns table(state jsonb, state_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_state) <> 'object'
     or not (p_state ? 'players') then
    raise exception 'invalid_game_state' using errcode = '22023';
  end if;

  return query
  update public.game_rooms
  set state = p_state,
      state_version = state_version + 1,
      updated_at = pg_catalog.now()
  where id = p_room_id
    and status = 'playing'
    and state_version = p_expected_version
    and (host_user_id = v_user_id or guest_user_id = v_user_id)
  returning game_rooms.state, game_rooms.state_version;

  if not found then
    raise exception 'game_state_conflict' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.start_game_room(uuid, jsonb) from public, anon;
revoke all on function public.update_game_room_state(uuid, bigint, jsonb) from public, anon;
grant execute on function public.start_game_room(uuid, jsonb) to authenticated;
grant execute on function public.update_game_room_state(uuid, bigint, jsonb) to authenticated;
