create or replace function private.send_game_effect_warning_impl(
  p_room_id uuid,
  p_expected_version bigint,
  p_owner text,
  p_card_id text
)
returns table(state jsonb,state_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_sender text;
  v_card_exists boolean;
  v_next jsonb;
  v_created_at bigint := pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()) * 1000)::bigint;
begin
  if p_owner not in ('p1','p2') or p_card_id is null or p_card_id = '' then
    raise exception 'invalid_effect_warning' using errcode='22023';
  end if;

  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version
     or v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'game_state_conflict' using errcode='40001';
  end if;
  v_sender := case when v_user_id=v_room.host_user_id then 'p1' else 'p2' end;
  if v_sender = p_owner then raise exception 'cannot_warn_own_card' using errcode='22023'; end if;

  select exists(
    select 1 from pg_catalog.jsonb_path_query(v_room.state #> array['players',p_owner], '$.*[*]') card
    where card ->> 'instanceId'=p_card_id
  ) into v_card_exists;
  if not v_card_exists then raise exception 'warning_card_not_found' using errcode='22023'; end if;

  v_next := pg_catalog.jsonb_set(v_room.state,'{notifications}',
    (select coalesce(pg_catalog.jsonb_agg(item order by ordinal),'[]'::jsonb)
     from (
       select item,ordinal
       from pg_catalog.jsonb_array_elements(coalesce(v_room.state -> 'notifications','[]'::jsonb)) with ordinality existing(item,ordinal)
       union all
       select pg_catalog.jsonb_build_object(
         'id','effect-warning-' || v_created_at || '-' || v_sender,
         'recipient',p_owner,
         'message','対戦相手から「効果無視の疑い」が送られました',
         'createdAt',v_created_at
       ),1000000::bigint
     ) notices),true);

  update public.game_rooms set state=v_next,state_version=game_rooms.state_version+1,updated_at=pg_catalog.now()
  where id=p_room_id returning game_rooms.state,game_rooms.state_version into state,state_version;
  return next;
end;
$$;

revoke all on function private.send_game_effect_warning_impl(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function private.send_game_effect_warning_impl(uuid,bigint,text,text) to authenticated;

create or replace function public.send_game_effect_warning(
  p_room_id uuid,p_expected_version bigint,p_owner text,p_card_id text
)
returns table(state jsonb,state_version bigint)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,result.state),result.state_version
  from private.send_game_effect_warning_impl(p_room_id,p_expected_version,p_owner,p_card_id) result
$$;

revoke all on function public.send_game_effect_warning(uuid,bigint,text,text) from public,anon;
grant execute on function public.send_game_effect_warning(uuid,bigint,text,text) to authenticated;
