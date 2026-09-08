create or replace function private.update_game_room_state_impl(p_room_id uuid, p_expected_version bigint, p_state jsonb)
returns table(state jsonb, state_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_latest_action public.game_room_actions%rowtype;
  v_before_state jsonb;
  v_action_kind text := 'board_update';
  v_actor_user_id uuid;
  v_active_user_id uuid;
  v_turn_number integer;
  v_requested_by text;
  v_incoming_card_ids text[];
  v_latest_card_ids text[];
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_state) <> 'object' or not (p_state ? 'players') then
    raise exception 'invalid_game_state' using errcode = '22023';
  end if;

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then
    raise exception 'game_state_conflict' using errcode = '40001';
  end if;
  if v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;

  v_before_state := v_room.state;
  if v_room.state_version <> p_expected_version then
    v_active_user_id := case v_room.state ->> 'activePlayer'
      when 'p1' then v_room.host_user_id
      when 'p2' then v_room.guest_user_id
      else null
    end;
    select * into v_latest_action
    from public.game_room_actions
    where room_id = p_room_id and applied
    order by id desc
    limit 1
    for update;

    if p_expected_version <> v_room.state_version - 1
       or v_user_id is distinct from v_active_user_id
       or v_latest_action.id is null
       or v_latest_action.after_state <> v_room.state
       or v_latest_action.actor_user_id = v_active_user_id then
      raise exception 'game_state_conflict' using errcode = '40001';
    end if;

    v_incoming_card_ids := private.changed_game_card_ids(v_latest_action.before_state, p_state);
    v_latest_card_ids := private.changed_game_card_ids(v_latest_action.before_state, v_latest_action.after_state);
    if not (v_incoming_card_ids && v_latest_card_ids) then
      raise exception 'game_state_conflict' using errcode = '40001';
    end if;

    v_before_state := v_latest_action.before_state;
    delete from public.game_room_actions where id = v_latest_action.id;
  end if;

  v_actor_user_id := v_user_id;
  v_turn_number := greatest(1, coalesce((v_before_state ->> 'turn')::integer, 1));
  if coalesce((p_state ->> 'turn')::integer, v_turn_number) = v_turn_number + 1
     and p_state ->> 'activePlayer' is distinct from v_before_state ->> 'activePlayer' then
    v_requested_by := v_before_state #>> '{turnRequest,requestedBy}';
    if v_requested_by in ('p1', 'p2') then
      v_action_kind := 'turn_end';
      v_actor_user_id := case when v_requested_by = 'p1' then v_room.host_user_id else v_room.guest_user_id end;
    end if;
  end if;

  delete from public.game_room_actions where room_id = p_room_id and not applied;
  update public.game_room_undo_requests set status = 'expired', responded_at = pg_catalog.now()
  where room_id = p_room_id and status = 'pending';
  update public.game_rooms
  set state = p_state, state_version = game_rooms.state_version + 1, updated_at = pg_catalog.now()
  where id = p_room_id;
  insert into public.game_room_actions(room_id, actor_user_id, submitted_by_user_id, turn_number, action_kind, before_state, after_state)
  values (p_room_id, v_actor_user_id, v_user_id, v_turn_number, v_action_kind, v_before_state, p_state);
  delete from public.game_room_actions
  where room_id = p_room_id and turn_number < greatest(1, coalesce((p_state ->> 'turn')::integer, v_turn_number) - 1);
  return query select rooms.state, rooms.state_version from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

revoke all on function private.update_game_room_state_impl(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function private.update_game_room_state_impl(uuid, bigint, jsonb) to authenticated;
