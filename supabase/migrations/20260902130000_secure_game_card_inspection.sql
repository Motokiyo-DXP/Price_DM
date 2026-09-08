create or replace function private.update_game_room_state_secure_impl(p_room_id uuid,p_expected_version bigint,p_state jsonb)
returns table(state jsonb,state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current jsonb;
  v_submitted jsonb;
begin
  select rooms.state into v_current from public.game_rooms as rooms
  where rooms.id=p_room_id and (rooms.host_user_id=v_user_id or rooms.guest_user_id=v_user_id)
  for update;
  if not found then raise exception 'room_access_denied' using errcode='42501'; end if;
  v_submitted := pg_catalog.jsonb_set(p_state,'{inspection}',coalesce(v_current -> 'inspection','null'::jsonb),true);
  return query select result.state,result.state_version
  from private.update_game_room_state_impl(
    p_room_id,p_expected_version,private.hydrate_submitted_game_state(v_submitted,v_current)
  ) result;
end;
$$;

create or replace function private.set_game_card_inspection_impl(
  p_room_id uuid,p_expected_version bigint,p_owner text default null,p_card_id text default null
)
returns table(state jsonb,state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_viewer text;
  v_recipient text;
  v_card_exists boolean;
  v_next jsonb;
  v_created_at bigint := pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()) * 1000)::bigint;
begin
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version
     or v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'game_state_conflict' using errcode='40001';
  end if;
  v_viewer := case when v_user_id=v_room.host_user_id then 'p1' else 'p2' end;
  v_recipient := case when v_viewer='p1' then 'p2' else 'p1' end;

  if p_card_id is null then
    if v_room.state #>> '{inspection,viewer}' is distinct from v_viewer then
      return query select v_room.state,v_room.state_version;
      return;
    end if;
    v_next := pg_catalog.jsonb_set(v_room.state,'{inspection}','null'::jsonb,true);
  else
    if p_owner not in ('p1','p2') then raise exception 'invalid_inspection_request' using errcode='22023'; end if;
    select exists(
      select 1 from pg_catalog.jsonb_path_query(v_room.state #> array['players',p_owner], '$.*[*]') card
      where card ->> 'instanceId'=p_card_id
    ) into v_card_exists;
    if not v_card_exists then raise exception 'inspection_card_not_found' using errcode='22023'; end if;
    v_next := pg_catalog.jsonb_set(v_room.state,'{inspection}',pg_catalog.jsonb_build_object(
      'cardId',p_card_id,'owner',p_owner,'viewer',v_viewer
    ),true);
    v_next := pg_catalog.jsonb_set(v_next,'{notifications}',coalesce(v_next -> 'notifications','[]'::jsonb)
      || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id','inspection-' || v_created_at || '-' || v_viewer,
        'recipient',v_recipient,'message','相手が非公開カードを確認しました','createdAt',v_created_at
      )),true);
  end if;

  update public.game_rooms set state=v_next,state_version=game_rooms.state_version+1,updated_at=pg_catalog.now()
  where id=p_room_id returning game_rooms.state,game_rooms.state_version into state,state_version;
  return next;
end;
$$;

revoke all on function private.set_game_card_inspection_impl(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function private.set_game_card_inspection_impl(uuid,bigint,text,text) to authenticated;

create or replace function public.set_game_card_inspection(
  p_room_id uuid,p_expected_version bigint,p_owner text default null,p_card_id text default null
)
returns table(state jsonb,state_version bigint)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,result.state),result.state_version
  from private.set_game_card_inspection_impl(p_room_id,p_expected_version,p_owner,p_card_id) result
$$;

revoke all on function public.set_game_card_inspection(uuid,bigint,text,text) from public,anon;
grant execute on function public.set_game_card_inspection(uuid,bigint,text,text) to authenticated;
