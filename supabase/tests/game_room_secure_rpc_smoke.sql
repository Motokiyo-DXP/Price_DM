begin;

do $$
declare
  v_host uuid;
  v_guest uuid := pg_catalog.gen_random_uuid();
  v_room uuid;
  v_host_view jsonb;
  v_guest_view jsonb;
  v_submitted jsonb;
  v_internal_name text;
  v_version bigint;
  v_card_id text;
  v_rejected boolean := false;
  v_host_card jsonb := pg_catalog.jsonb_build_object('canonicalCardId',101,'name','HOST SECRET','imageKey',null,'quantity',40,'zone','main','cost',3,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
  v_guest_card jsonb := pg_catalog.jsonb_build_object('canonicalCardId',202,'name','GUEST SECRET','imageKey',null,'quantity',40,'zone','main','cost',4,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
begin
  select id into v_host from auth.users order by created_at limit 1;
  if v_host is null then raise exception 'test requires one existing auth user'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','secure-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.game_rooms(room_code,host_user_id,guest_user_id,status,format,host_deck_snapshot,guest_deck_snapshot,host_ready,guest_ready)
  values(pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,6)),v_host,v_guest,'ready','original',
    pg_catalog.jsonb_build_object('name','host','cards',pg_catalog.jsonb_build_array(v_host_card)),
    pg_catalog.jsonb_build_object('name','guest','cards',pg_catalog.jsonb_build_array(v_guest_card)),true,true)
  returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select state,state_version into v_host_view,v_version from public.start_game_room(v_room);
  if v_host_view #>> '{players,p1,hand,0,name}' <> 'HOST SECRET'
     or v_host_view #>> '{players,p2,hand,0,name}' <> '非公開カード'
     or v_host_view #>> '{players,p1,deck,0,name}' <> '非公開カード' then
    raise exception 'host redaction is incorrect';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_guest::text,true);
  select state into v_guest_view from public.get_game_room_state(v_room);
  if v_guest_view #>> '{players,p2,hand,0,name}' <> 'GUEST SECRET'
     or v_guest_view #>> '{players,p1,hand,0,name}' <> '非公開カード' then
    raise exception 'guest redaction is incorrect';
  end if;

  v_card_id := v_guest_view #>> '{players,p1,hand,0,instanceId}';
  v_submitted := pg_catalog.jsonb_set(v_guest_view,'{players,p1,hand,0,tapped}','true'::jsonb);
  select state,state_version into v_guest_view,v_version from public.update_game_room_state(v_room,v_version,v_submitted);
  select card ->> 'name' into v_internal_name
  from public.game_rooms rooms, lateral pg_catalog.jsonb_path_query(rooms.state,'$.players.p1.hand[*]') card
  where rooms.id=v_room and card ->> 'instanceId'=v_card_id;
  if v_internal_name <> 'HOST SECRET' then raise exception 'hidden identity was lost during update'; end if;

  begin
    perform * from public.update_game_room_state(v_room,v_version,
      pg_catalog.jsonb_set(v_guest_view,'{players,p2,hand}',(v_guest_view #> '{players,p2,hand}') || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('instanceId','forged'))));
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'forged card was accepted by public RPC'; end if;
end;
$$;

set local role authenticated;
do $$
declare v_denied boolean := false;
begin
  begin
    perform rooms.state from public.game_rooms rooms limit 1;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'authenticated role can still select game_rooms.state directly'; end if;
end;
$$;
reset role;

rollback;
