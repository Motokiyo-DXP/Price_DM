create or replace function public.get_game_room_history_status(p_room_id uuid)
returns table(can_undo boolean, can_redo boolean, undo_requires_approval boolean, pending_request_id uuid, pending_requester_name text)
language plpgsql security definer set search_path = '' stable
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_undo public.game_room_actions%rowtype;
  v_redo public.game_room_actions%rowtype;
begin
  select * into v_room from public.game_rooms where id = p_room_id;
  if not found or v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;
  select * into v_undo from public.game_room_actions where room_id = p_room_id and applied order by id desc limit 1;
  select * into v_redo from public.game_room_actions where room_id = p_room_id and not applied order by id asc limit 1;
  return query
  select
    v_undo.id is not null and v_undo.actor_user_id = v_user_id and v_room.state = v_undo.after_state,
    v_redo.id is not null and v_redo.actor_user_id = v_user_id and v_room.state = v_redo.before_state,
    v_undo.id is not null and v_undo.actor_user_id = v_user_id and v_undo.action_kind = 'turn_end',
    requests.id,
    coalesce(profiles.display_name, '対戦相手')
  from (select 1) as singleton
  left join public.game_room_undo_requests as requests
    on requests.room_id = p_room_id and requests.responder_user_id = v_user_id and requests.status = 'pending'
  left join public.profiles as profiles on profiles.user_id = requests.requester_user_id
  order by requests.created_at desc nulls last limit 1;
end;
$$;

revoke all on function public.get_game_room_history_status(uuid) from public, anon;
grant execute on function public.get_game_room_history_status(uuid) to authenticated;
