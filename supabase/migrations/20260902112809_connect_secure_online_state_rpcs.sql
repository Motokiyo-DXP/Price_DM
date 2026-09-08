create or replace function private.redact_game_room_state_for_current_user(p_room_id uuid, p_state jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_viewer text;
  v_spectator boolean := false;
begin
  select * into v_room from public.game_rooms where id = p_room_id;
  if not found or v_user_id is null then raise exception 'room_access_denied' using errcode = '42501'; end if;
  if v_user_id = v_room.host_user_id then v_viewer := 'p1';
  elsif v_user_id = v_room.guest_user_id then v_viewer := 'p2';
  elsif exists (select 1 from public.game_room_spectators where room_id = p_room_id and user_id = v_user_id) then
    v_viewer := 'p1'; v_spectator := true;
  else raise exception 'room_access_denied' using errcode = '42501';
  end if;
  return private.redact_game_state(p_state,v_viewer,v_spectator);
end;
$$;

revoke all on function private.redact_game_room_state_for_current_user(uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.redact_game_room_state_for_current_user(uuid,jsonb) to authenticated;
grant execute on function private.hydrate_submitted_game_state(jsonb,jsonb) to authenticated;

alter function public.start_game_room(uuid) set schema private;
alter function private.start_game_room(uuid) rename to start_game_room_impl;
revoke all on function private.start_game_room_impl(uuid) from public,anon,authenticated;
grant execute on function private.start_game_room_impl(uuid) to authenticated;

create function public.start_game_room(p_room_id uuid)
returns table(state jsonb,state_version bigint)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,started.state),started.state_version
  from private.start_game_room_impl(p_room_id) as started
$$;

create or replace function public.update_game_room_state(p_room_id uuid,p_expected_version bigint,p_state jsonb)
returns table(state jsonb,state_version bigint)
language sql security invoker set search_path = ''
as $$
  with current_state as (
    select rooms.state from public.game_rooms as rooms where rooms.id = p_room_id
  ), saved as (
    select result.state,result.state_version
    from current_state
    cross join lateral private.update_game_room_state_impl(
      p_room_id,p_expected_version,private.hydrate_submitted_game_state(p_state,current_state.state)
    ) as result
  )
  select private.redact_game_room_state_for_current_user(p_room_id,saved.state),saved.state_version from saved
$$;

create or replace function public.get_game_room_state(p_room_id uuid)
returns table(state jsonb,state_version bigint)
language sql stable security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,rooms.state),rooms.state_version
  from public.game_rooms as rooms where rooms.id = p_room_id
$$;

revoke all on function public.start_game_room(uuid) from public,anon;
revoke all on function public.update_game_room_state(uuid,bigint,jsonb) from public,anon;
revoke all on function public.get_game_room_state(uuid) from public,anon;
grant execute on function public.start_game_room(uuid) to authenticated;
grant execute on function public.update_game_room_state(uuid,bigint,jsonb) to authenticated;
grant execute on function public.get_game_room_state(uuid) to authenticated;
