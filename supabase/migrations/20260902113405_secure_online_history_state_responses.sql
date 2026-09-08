create or replace function private.redact_undo_request_state_for_current_user(p_request_id uuid,p_state jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_room_id uuid;
begin
  select requests.room_id into v_room_id from public.game_room_undo_requests requests where requests.id=p_request_id;
  if not found then raise exception 'undo_request_not_found' using errcode='P0002'; end if;
  return private.redact_game_room_state_for_current_user(v_room_id,p_state);
end;
$$;

revoke all on function private.redact_undo_request_state_for_current_user(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.redact_undo_request_state_for_current_user(uuid,jsonb) to authenticated;

create or replace function public.undo_game_room_action(p_room_id uuid,p_expected_version bigint)
returns table(state jsonb,state_version bigint,result text)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,changed.state),changed.state_version,changed.result
  from private.undo_game_room_action_impl(p_room_id,p_expected_version) changed
$$;

create or replace function public.redo_game_room_action(p_room_id uuid,p_expected_version bigint)
returns table(state jsonb,state_version bigint,result text)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,changed.state),changed.state_version,changed.result
  from private.redo_game_room_action_impl(p_room_id,p_expected_version) changed
$$;

create or replace function public.respond_game_room_undo_request(p_request_id uuid,p_approve boolean,p_expected_version bigint)
returns table(state jsonb,state_version bigint,result text)
language sql security invoker set search_path = ''
as $$
  select private.redact_undo_request_state_for_current_user(p_request_id,changed.state),changed.state_version,changed.result
  from private.respond_game_room_undo_request_impl(p_request_id,p_approve,p_expected_version) changed
$$;

revoke all on function public.undo_game_room_action(uuid,bigint) from public,anon;
revoke all on function public.redo_game_room_action(uuid,bigint) from public,anon;
revoke all on function public.respond_game_room_undo_request(uuid,boolean,bigint) from public,anon;
grant execute on function public.undo_game_room_action(uuid,bigint) to authenticated;
grant execute on function public.redo_game_room_action(uuid,bigint) to authenticated;
grant execute on function public.respond_game_room_undo_request(uuid,boolean,bigint) to authenticated;
