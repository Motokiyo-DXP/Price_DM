create or replace function private.run_game_yobinion_impl(
  p_room_id uuid,
  p_expected_version bigint,
  p_owner text,
  p_source_id text,
  p_dragon_only boolean default false
)
returns table(state jsonb,state_version bigint,found boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_source jsonb;
  v_source_cost integer;
  v_deck jsonb;
  v_match jsonb;
  v_match_position bigint;
  v_revealed jsonb;
  v_remainder jsonb;
  v_next_deck jsonb;
  v_battle jsonb;
  v_next jsonb;
  v_stack_id text := 'yobinion-' || pg_catalog.gen_random_uuid()::text;
  v_created_at bigint := pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()) * 1000)::bigint;
begin
  if p_owner not in ('p1','p2') or p_source_id is null or p_source_id = '' then
    raise exception 'invalid_yobinion_request' using errcode='22023';
  end if;

  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version
     or v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'game_state_conflict' using errcode='40001';
  end if;

  select card into v_source
  from pg_catalog.jsonb_path_query(v_room.state #> array['players',p_owner], '$.*[*]') card
  where card ->> 'instanceId' = p_source_id
  limit 1;
  if v_source is null then raise exception 'yobinion_source_not_found' using errcode='22023'; end if;

  v_source_cost := case
    when pg_catalog.jsonb_typeof(v_source -> 'cost')='number' then (v_source ->> 'cost')::integer
    when pg_catalog.btrim(v_source ->> 'name')='ヨビニオン・マルル' then 4
    else null end;
  if v_source_cost is null then raise exception 'yobinion_source_cost_missing' using errcode='22023'; end if;

  v_deck := v_room.state #> array['players',p_owner,'deck'];
  if pg_catalog.jsonb_typeof(v_deck) <> 'array' then raise exception 'invalid_game_zone' using errcode='22023'; end if;

  select item.card,item.position into v_match,v_match_position
  from pg_catalog.jsonb_array_elements(v_deck) with ordinality item(card,position)
  where coalesce(
      case when pg_catalog.jsonb_typeof(item.card -> 'cost')='number' then (item.card ->> 'cost')::integer end,
      case pg_catalog.btrim(item.card ->> 'name') when '天災 デドダム' then 3 end
    ) < v_source_cost
    and exists (
      select 1 from pg_catalog.jsonb_array_elements_text(coalesce(item.card -> 'cardTypes','[]'::jsonb)) card_type
      where card_type like '%クリーチャー%'
    )
    and (not p_dragon_only or item.card ->> 'name' like '%ドラゴン%'
      or exists (
        select 1 from pg_catalog.jsonb_array_elements_text(coalesce(item.card -> 'cardTypes','[]'::jsonb)) card_type
        where card_type like '%ドラゴン%'
      ))
  order by item.position
  limit 1;

  if v_match is null then
    return query select private.redact_game_room_state_for_current_user(p_room_id,v_room.state),v_room.state_version,false;
    return;
  end if;

  select coalesce(pg_catalog.jsonb_agg(card order by position),'[]'::jsonb) into v_revealed
  from pg_catalog.jsonb_array_elements(v_deck) with ordinality item(card,position)
  where position < v_match_position;

  with randomized as (
    select card,pg_catalog.row_number() over(order by pg_catalog.random()) - 1 as stack_order
    from pg_catalog.jsonb_array_elements(v_revealed) item(card)
  )
  select coalesce(pg_catalog.jsonb_agg(
    card || pg_catalog.jsonb_build_object(
      'face','face_down','tapped',false,'shieldMarker',null,'stackId',v_stack_id,
      'stackOrder',stack_order,'stackLayout','diagonal','stackPlacement','top'
    ) order by stack_order
  ),'[]'::jsonb) into v_remainder from randomized;

  select coalesce(pg_catalog.jsonb_agg(card order by position),'[]'::jsonb) into v_next_deck
  from pg_catalog.jsonb_array_elements(v_deck) with ordinality item(card,position)
  where position > v_match_position;
  v_next_deck := v_next_deck || v_remainder;

  v_match := v_match || pg_catalog.jsonb_build_object(
    'face','face_up','tapped',false,'shieldMarker',null,'stackId',null,
    'stackOrder',null,'stackLayout',null,'stackPlacement',null
  );
  v_battle := coalesce(v_room.state #> array['players',p_owner,'battle'],'[]'::jsonb) || pg_catalog.jsonb_build_array(v_match);
  v_next := pg_catalog.jsonb_set(v_room.state,array['players',p_owner,'deck'],v_next_deck,false);
  v_next := pg_catalog.jsonb_set(v_next,array['players',p_owner,'battle'],v_battle,false);
  v_next := pg_catalog.jsonb_set(v_next,'{notifications}',
    coalesce(v_room.state -> 'notifications','[]'::jsonb) || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id','yobinion-' || v_created_at || '-' || p_owner || '-p1','recipient','p1',
        'message','ヨビニオン：' || (v_match ->> 'name') || 'をバトルゾーンへ移動しました（確認' || v_match_position || '枚）',
        'createdAt',v_created_at,'revealedCard',v_match
      ),
      pg_catalog.jsonb_build_object(
        'id','yobinion-' || v_created_at || '-' || p_owner || '-p2','recipient','p2',
        'message','ヨビニオン：' || (v_match ->> 'name') || 'をバトルゾーンへ移動しました（確認' || v_match_position || '枚）',
        'createdAt',v_created_at,'revealedCard',v_match
      )
    ),true);

  return query select saved.state,saved.state_version,true
  from private.update_game_room_state_impl(p_room_id,p_expected_version,v_next) saved;
end;
$$;

revoke all on function private.run_game_yobinion_impl(uuid,bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function private.run_game_yobinion_impl(uuid,bigint,text,text,boolean) to authenticated;

create or replace function public.run_game_yobinion(
  p_room_id uuid,p_expected_version bigint,p_owner text,p_source_id text,p_dragon_only boolean default false
)
returns table(state jsonb,state_version bigint,found boolean)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,result.state),result.state_version,result.found
  from private.run_game_yobinion_impl(p_room_id,p_expected_version,p_owner,p_source_id,p_dragon_only) result
$$;

revoke all on function public.run_game_yobinion(uuid,bigint,text,text,boolean) from public,anon;
grant execute on function public.run_game_yobinion(uuid,bigint,text,text,boolean) to authenticated;
