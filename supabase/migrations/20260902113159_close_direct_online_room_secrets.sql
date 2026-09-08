create or replace function private.update_game_room_state_secure_impl(p_room_id uuid,p_expected_version bigint,p_state jsonb)
returns table(state jsonb,state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current jsonb;
begin
  select rooms.state into v_current from public.game_rooms as rooms
  where rooms.id=p_room_id and (rooms.host_user_id=v_user_id or rooms.guest_user_id=v_user_id)
  for update;
  if not found then raise exception 'room_access_denied' using errcode='42501'; end if;
  return query select result.state,result.state_version
  from private.update_game_room_state_impl(p_room_id,p_expected_version,private.hydrate_submitted_game_state(p_state,v_current)) as result;
end;
$$;

revoke all on function private.update_game_room_state_secure_impl(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.update_game_room_state_secure_impl(uuid,bigint,jsonb) to authenticated;

create or replace function public.update_game_room_state(p_room_id uuid,p_expected_version bigint,p_state jsonb)
returns table(state jsonb,state_version bigint)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,saved.state),saved.state_version
  from private.update_game_room_state_secure_impl(p_room_id,p_expected_version,p_state) as saved
$$;

create or replace function public.get_game_room_deck_labels(p_room_id uuid)
returns table(host_name text,guest_name text,selected_deck_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_room public.game_rooms%rowtype;
begin
  select * into v_room from public.game_rooms where id=p_room_id;
  if not found or v_user_id is null or not (v_user_id=v_room.host_user_id or v_user_id=v_room.guest_user_id
    or exists(select 1 from public.game_room_spectators where room_id=p_room_id and user_id=v_user_id)) then
    raise exception 'room_access_denied' using errcode='42501';
  end if;
  return query select v_room.host_deck_snapshot ->> 'name',v_room.guest_deck_snapshot ->> 'name',
    case when v_user_id=v_room.host_user_id then nullif(v_room.host_deck_snapshot ->> 'sourceDeckId','')::uuid
         when v_user_id=v_room.guest_user_id then nullif(v_room.guest_deck_snapshot ->> 'sourceDeckId','')::uuid else null end;
end;
$$;

revoke all on function public.get_game_room_deck_labels(uuid) from public,anon;
grant execute on function public.get_game_room_deck_labels(uuid) to authenticated;

revoke select on public.game_rooms from authenticated;
grant select (id,room_code,host_user_id,guest_user_id,status,format,host_ready,guest_ready,state_version,
  created_at,updated_at,expires_at,time_limit_minutes,started_at,ended_at,winner_user_id,end_reason,
  host_rematch_ready,guest_rematch_ready,retired_at,retirement_reason) on public.game_rooms to authenticated;
