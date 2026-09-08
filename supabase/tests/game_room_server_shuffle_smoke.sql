begin;

do $$
declare
  v_host uuid; v_guest uuid := pg_catalog.gen_random_uuid(); v_room uuid;
  v_state jsonb; v_internal jsonb; v_version bigint; v_next_version bigint;
  v_card_ids text[]; v_stack_id text; v_before_ids text[]; v_after_ids text[];
  v_card jsonb := pg_catalog.jsonb_build_object('canonicalCardId',1,'name','SECRET','imageKey',null,'quantity',40,'zone','main','cost',1,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
begin
  select id into v_host from auth.users order by created_at limit 1;
  if v_host is null then raise exception 'test requires one existing auth user'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','shuffle-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.game_rooms(room_code,host_user_id,guest_user_id,status,format,host_deck_snapshot,guest_deck_snapshot,host_ready,guest_ready)
  values(pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,6)),v_host,v_guest,'ready','original',
    pg_catalog.jsonb_build_object('name','host','cards',pg_catalog.jsonb_build_array(v_card)),
    pg_catalog.jsonb_build_object('name','guest','cards',pg_catalog.jsonb_build_array(v_card)),true,true) returning id into v_room;
  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select state,state_version into v_state,v_version from public.start_game_room(v_room);
  select pg_catalog.array_agg(card ->> 'instanceId' order by card ->> 'instanceId') into v_before_ids
  from pg_catalog.jsonb_array_elements(v_state #> '{players,p1,deck}') card;
  select state,state_version into v_state,v_next_version
  from public.shuffle_game_cards(v_room,v_version,'p1','deck','deck',null,null);
  if v_next_version <> v_version+1 then raise exception 'deck shuffle did not advance version'; end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(v_state #> '{players,p1,deck}') card where card ->> 'name' <> '非公開カード' or card ->> 'face' <> 'face_down') then
    raise exception 'deck shuffle leaked or exposed cards';
  end if;
  select pg_catalog.array_agg(card ->> 'instanceId' order by card ->> 'instanceId') into v_after_ids
  from pg_catalog.jsonb_array_elements(v_state #> '{players,p1,deck}') card;
  if v_before_ids <> v_after_ids then raise exception 'deck shuffle changed card membership'; end if;
  v_version := v_next_version;

  select pg_catalog.array_agg(card ->> 'instanceId') into v_card_ids
  from (select card from pg_catalog.jsonb_array_elements(v_state #> '{players,p1,hand}') card limit 3) picked;
  select state,state_version into v_state,v_version
  from public.shuffle_game_cards(v_room,v_version,'p1','hand','selection',v_card_ids,null);
  select rooms.state into v_internal from public.game_rooms rooms where id=v_room;
  select card ->> 'stackId' into v_stack_id from pg_catalog.jsonb_array_elements(v_internal #> '{players,p1,hand}') card
  where card ->> 'instanceId'=v_card_ids[1];
  if v_stack_id is null or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(v_internal #> '{players,p1,hand}') card
      where card ->> 'instanceId'=any(v_card_ids) and card ->> 'stackId'=v_stack_id and card ->> 'face'='face_down') <> 3 then
    raise exception 'selection shuffle did not create a face-down stack';
  end if;

  select state,state_version into v_state,v_next_version
  from public.shuffle_game_cards(v_room,v_version,'p1','hand','stack',null,v_stack_id);
  if v_next_version <> v_version+1 then raise exception 'stack shuffle did not advance version'; end if;
  if not exists(select 1 from public.game_room_actions where room_id=v_room and after_state=(select state from public.game_rooms where id=v_room)) then
    raise exception 'server shuffle was not recorded in history';
  end if;
end;
$$;

rollback;
