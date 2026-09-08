alter function public.get_game_room_history_status(uuid) set schema private;
alter function private.get_game_room_history_status(uuid) rename to get_game_room_history_status_impl;
alter function public.undo_game_room_action(uuid, bigint) set schema private;
alter function private.undo_game_room_action(uuid, bigint) rename to undo_game_room_action_impl;
alter function public.redo_game_room_action(uuid, bigint) set schema private;
alter function private.redo_game_room_action(uuid, bigint) rename to redo_game_room_action_impl;
alter function public.respond_game_room_undo_request(uuid, boolean, bigint) set schema private;
alter function private.respond_game_room_undo_request(uuid, boolean, bigint) rename to respond_game_room_undo_request_impl;

revoke all on function private.get_game_room_history_status_impl(uuid) from public, anon, authenticated;
revoke all on function private.undo_game_room_action_impl(uuid, bigint) from public, anon, authenticated;
revoke all on function private.redo_game_room_action_impl(uuid, bigint) from public, anon, authenticated;
revoke all on function private.respond_game_room_undo_request_impl(uuid, boolean, bigint) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.get_game_room_history_status_impl(uuid) to authenticated;
grant execute on function private.undo_game_room_action_impl(uuid, bigint) to authenticated;
grant execute on function private.redo_game_room_action_impl(uuid, bigint) to authenticated;
grant execute on function private.respond_game_room_undo_request_impl(uuid, boolean, bigint) to authenticated;

create function public.get_game_room_history_status(p_room_id uuid)
returns table(can_undo boolean, can_redo boolean, undo_requires_approval boolean, pending_request_id uuid, pending_requester_name text)
language sql security invoker set search_path = ''
as $$ select * from private.get_game_room_history_status_impl(p_room_id) $$;

create function public.undo_game_room_action(p_room_id uuid, p_expected_version bigint)
returns table(state jsonb, state_version bigint, result text)
language sql security invoker set search_path = ''
as $$ select * from private.undo_game_room_action_impl(p_room_id, p_expected_version) $$;

create function public.redo_game_room_action(p_room_id uuid, p_expected_version bigint)
returns table(state jsonb, state_version bigint, result text)
language sql security invoker set search_path = ''
as $$ select * from private.redo_game_room_action_impl(p_room_id, p_expected_version) $$;

create function public.respond_game_room_undo_request(p_request_id uuid, p_approve boolean, p_expected_version bigint)
returns table(state jsonb, state_version bigint, result text)
language sql security invoker set search_path = ''
as $$ select * from private.respond_game_room_undo_request_impl(p_request_id, p_approve, p_expected_version) $$;

revoke all on function public.get_game_room_history_status(uuid) from public, anon;
revoke all on function public.undo_game_room_action(uuid, bigint) from public, anon;
revoke all on function public.redo_game_room_action(uuid, bigint) from public, anon;
revoke all on function public.respond_game_room_undo_request(uuid, boolean, bigint) from public, anon;
grant execute on function public.get_game_room_history_status(uuid) to authenticated;
grant execute on function public.undo_game_room_action(uuid, bigint) to authenticated;
grant execute on function public.redo_game_room_action(uuid, bigint) to authenticated;
grant execute on function public.respond_game_room_undo_request(uuid, boolean, bigint) to authenticated;
