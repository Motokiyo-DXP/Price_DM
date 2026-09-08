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
  values(v_guest,'authenticated','authenticated','warning-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.game_rooms(room_code,host_user_id,guest_user_id,status,format,state,state_version,host_deck_snapshot,guest_deck_snapshot)
  values(pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,6)),v_host,v_guest,'playing','original',
    pg_catalog.jsonb_build_object('turn',1,'activePlayer','p1','notifications','[]'::jsonb,
      'players',pg_catalog.jsonb_build_object(
        'p1',pg_catalog.jsonb_build_object('deck','[]'::jsonb,'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb),
        'p2',pg_catalog.jsonb_build_object('deck','[]'::jsonb,'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('instanceId','guest-card','name','非公開でも漏らさないカード','face','face_down')
        ),'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb)
      )),1,'{}'::jsonb,'{}'::jsonb) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select result.state,result.state_version into v_state,v_version
  from public.send_game_effect_warning(v_room,1,'p2','guest-card') result;
  if v_state #>> '{notifications,0,recipient}' <> 'p2' then raise exception 'warning recipient mismatch'; end if;
  if v_state #>> '{notifications,0,message}' like '%非公開でも漏らさないカード%' then raise exception 'card identity leaked'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_guest::text,true);
  select result.state,result.state_version into v_state,v_version from public.get_game_room_state(v_room) result;
  if v_state #>> '{notifications,0,message}' <> '対戦相手から「効果無視の疑い」が送られました' then
    raise exception 'warning was not delivered';
  end if;

  begin
    perform * from public.send_game_effect_warning(v_room,v_version,'p2','guest-card');
    raise exception 'self warning unexpectedly allowed';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;
