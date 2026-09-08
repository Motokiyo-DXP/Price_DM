begin;
do $$
declare
  v_host uuid;
  v_guest uuid := pg_catalog.gen_random_uuid();
  v_room uuid;
  v_state jsonb;
  v_version bigint;
begin
  select id into v_host from auth.users order by created_at limit 1;
  if v_host is null then raise exception 'test requires one existing auth user'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','inspect-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.game_rooms(room_code,host_user_id,guest_user_id,status,format,state,state_version,host_deck_snapshot,guest_deck_snapshot)
  values(pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,6)),v_host,v_guest,'playing','original',
    pg_catalog.jsonb_build_object('turn',1,'activePlayer','p1','shieldPlacementOrder',0,'inspection',null,
      'players',pg_catalog.jsonb_build_object(
        'p1',pg_catalog.jsonb_build_object('deck','[]'::jsonb,'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb),
        'p2',pg_catalog.jsonb_build_object('deck','[]'::jsonb,'hand',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('instanceId','guest-secret','canonicalCardId',99,'name','秘密のカード','imageUrl','secret.jpg','cost',3,'civilizations','[]'::jsonb,'cardTypes',pg_catalog.jsonb_build_array('クリーチャー'),'face','owner_only','tapped',false,'shieldMarker',null)
        ),'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb)
      )),1,'{}'::jsonb,'{}'::jsonb) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select result.state,result.state_version into v_state,v_version from public.get_game_room_state(v_room) result;
  if v_state #>> '{players,p2,hand,0,name}' <> '非公開カード' then raise exception 'secret leaked before inspection'; end if;

  v_state := pg_catalog.jsonb_set(v_state,'{inspection}',pg_catalog.jsonb_build_object('cardId','guest-secret','owner','p2','viewer','p1'),true);
  select result.state,result.state_version into v_state,v_version from public.update_game_room_state(v_room,1,v_state) result;
  if v_state #>> '{players,p2,hand,0,name}' <> '非公開カード' or v_state -> 'inspection' <> 'null'::jsonb then
    raise exception 'generic update forged inspection';
  end if;

  select result.state,result.state_version into v_state,v_version
  from public.set_game_card_inspection(v_room,v_version,'p2','guest-secret') result;
  if v_state #>> '{players,p2,hand,0,name}' <> '秘密のカード' or v_state #>> '{inspection,viewer}' <> 'p1' then
    raise exception 'confirmed viewer did not receive card identity';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_guest::text,true);
  select result.state,result.state_version into v_state,v_version from public.get_game_room_state(v_room) result;
  if v_state #>> '{players,p2,hand,0,name}' <> '秘密のカード' then raise exception 'owner lost own card visibility'; end if;
  if v_state #>> '{notifications,0,recipient}' <> 'p2' then raise exception 'opponent notification missing'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select result.state,result.state_version into v_state,v_version
  from public.set_game_card_inspection(v_room,v_version,null,null) result;
  if v_state -> 'inspection' <> 'null'::jsonb or v_state #>> '{players,p2,hand,0,name}' <> '非公開カード' then
    raise exception 'inspection did not clear';
  end if;
end $$;
rollback;
