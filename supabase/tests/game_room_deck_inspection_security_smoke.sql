begin;
do $$
declare
  v_host uuid := pg_catalog.gen_random_uuid();
  v_guest uuid := pg_catalog.gen_random_uuid();
  v_room uuid;
  v_cards jsonb;
  v_version bigint;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_host,'authenticated','authenticated','deck-owner-'||v_host||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','deck-inspect-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.game_rooms(room_code,host_user_id,guest_user_id,status,format,state,state_version,host_deck_snapshot,guest_deck_snapshot)
  values(pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,6)),v_host,v_guest,'playing','original',
    pg_catalog.jsonb_build_object('turn',1,'activePlayer','p1','shieldPlacementOrder',0,
      'players',pg_catalog.jsonb_build_object(
        'p1',pg_catalog.jsonb_build_object('deck',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('instanceId','host-deck-1','name','ホストの山札')), 'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb),
        'p2',pg_catalog.jsonb_build_object('deck',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('instanceId','guest-deck-1','name','ゲストの山札')), 'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb)
      )),1,'{}'::jsonb,'{}'::jsonb) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select public.inspect_own_game_deck(v_room,1) into v_cards;
  if v_cards #>> '{0,name}' <> 'ホストの山札' then raise exception 'host did not receive own deck'; end if;
  if pg_catalog.jsonb_array_length(public.inspect_own_game_deck(v_room,null)) <> 1 then raise exception 'MAX did not return whole own deck'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_guest::text,true);
  select public.inspect_own_game_deck(v_room,1) into v_cards;
  if v_cards #>> '{0,name}' <> 'ゲストの山札' then raise exception 'guest did not receive own deck'; end if;

  select result.state,result.state_version into v_cards,v_version
  from public.get_game_room_state(v_room) result;
  if v_cards #>> '{players,p1,deck,0,instanceId}' = 'host-deck-1'
     or v_cards #>> '{players,p1,deck,0,instanceId}' <> 'hidden-p1-deck-1' then
    raise exception 'opponent deck instance leaked';
  end if;

  select result.state into v_cards
  from public.update_game_room_state(v_room,v_version,v_cards) result;
  if v_cards #>> '{players,p1,deck,0,instanceId}' <> 'hidden-p1-deck-1' then
    raise exception 'redacted opponent deck could not round trip';
  end if;
end $$;
rollback;
