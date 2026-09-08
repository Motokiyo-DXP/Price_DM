create or replace function private.get_game_room_state_impl(p_room_id uuid)
returns table(state jsonb, state_version bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.redact_game_room_state_for_current_user(p_room_id, rooms.state),
    rooms.state_version
  from public.game_rooms as rooms
  where rooms.id = p_room_id
$$;

revoke all on function private.get_game_room_state_impl(uuid) from public, anon, authenticated;
grant execute on function private.get_game_room_state_impl(uuid) to authenticated;

create or replace function public.get_game_room_state(p_room_id uuid)
returns table(state jsonb, state_version bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select current_state.state, current_state.state_version
  from private.get_game_room_state_impl(p_room_id) as current_state
$$;

revoke all on function public.get_game_room_state(uuid) from public, anon;
grant execute on function public.get_game_room_state(uuid) to authenticated;
