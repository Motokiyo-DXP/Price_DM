begin;
do $$
declare
  v_host uuid;
  v_guest uuid := pg_catalog.gen_random_uuid();
  v_room uuid;
  v_state jsonb;
  v_version bigint;
  v_found boolean;
  v_card jsonb;
begin
  select id into v_host from auth.users order by created_at limit 1;
  if v_host is null then raise exception 'test requires one existing auth user'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','yobinion-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.game_rooms(room_code,host_user_id,guest_user_id,status,format,state,state_version,host_deck_snapshot,guest_deck_snapshot)
  values(pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,6)),v_host,v_guest,'playing','original',pg_catalog.jsonb_build_object(
    'turn',1,'activePlayer','p1','shieldPlacementOrder',0,
    'players',pg_catalog.jsonb_build_object(
      'p1',pg_catalog.jsonb_build_object(
        'deck',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('instanceId','miss','canonicalCardId',1,'name','呪文','imageUrl',null,'cost',1,'civilizations','[]'::jsonb,'cardTypes',pg_catalog.jsonb_build_array('呪文'),'face','face_down','tapped',false,'shieldMarker',null),
          pg_catalog.jsonb_build_object('instanceId','dedodam','canonicalCardId',2,'name','天災 デドダム','imageUrl','dedodam.jpg','cost',null,'civilizations','[]'::jsonb,'cardTypes',pg_catalog.jsonb_build_array('タマシード/クリーチャー'),'face','face_down','tapped',false,'shieldMarker',null),
          pg_catalog.jsonb_build_object('instanceId','tail','canonicalCardId',3,'name','後続','imageUrl',null,'cost',9,'civilizations','[]'::jsonb,'cardTypes',pg_catalog.jsonb_build_array('クリーチャー'),'face','face_down','tapped',false,'shieldMarker',null)
        ),'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,
        'battle',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('instanceId','maruru','canonicalCardId',4,'name','ヨビニオン・マルル','imageUrl',null,'cost',null,'civilizations','[]'::jsonb,'cardTypes',pg_catalog.jsonb_build_array('クリーチャー'),'face','face_up','tapped',false,'shieldMarker',null)),
        'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb),
      'p2',pg_catalog.jsonb_build_object('deck','[]'::jsonb,'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb)
    )),1,'{}'::jsonb,'{}'::jsonb) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select result.state,result.state_version,result.found into v_state,v_version,v_found
  from public.run_game_yobinion(v_room,1,'p1','maruru',false) result;
  if not v_found or v_version <> 2 then raise exception 'yobinion did not run'; end if;
  if v_state #>> '{players,p1,battle,1,name}' <> '天災 デドダム' then raise exception 'dedodam was not moved to battle'; end if;
  if pg_catalog.jsonb_array_length(v_state #> '{players,p1,deck}') <> 2 then raise exception 'deck count is wrong'; end if;
  if v_state #>> '{players,p1,deck,0,instanceId}' <> 'tail' then raise exception 'unmatched tail order changed'; end if;
  if v_state #>> '{players,p1,deck,1,instanceId}' <> 'miss' or v_state #>> '{players,p1,deck,1,face}' <> 'face_down' then raise exception 'revealed miss was not returned face down'; end if;
  if v_state #>> '{notifications,0,revealedCard,name}' <> '天災 デドダム' then raise exception 'revealed notification missing'; end if;
  select pg_catalog.count(*) into v_version from public.game_room_actions where room_id=v_room and action_kind='board_update';
  if v_version <> 1 then raise exception 'history missing'; end if;

  select result.state,result.state_version,result.found into v_state,v_version,v_found
  from public.run_game_yobinion(v_room,2,'p1','maruru',true) result;
  if v_found or v_version <> 2 then raise exception 'not-found dragon yobinion changed state'; end if;
end $$;
rollback;
