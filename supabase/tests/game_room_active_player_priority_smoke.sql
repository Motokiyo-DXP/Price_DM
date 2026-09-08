begin;

do $$
declare
  v_host uuid;
  v_guest uuid;
  v_room uuid;
  v_version bigint;
  v_base_version bigint;
  v_state jsonb;
  v_conflict boolean;
  v_card jsonb := pg_catalog.jsonb_build_object('canonicalCardId',1,'name','test','imageKey',null,'quantity',2,'zone','main','cost',1,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
begin
  select id into v_host from auth.users order by created_at limit 1;
  v_guest := gen_random_uuid();
  insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_guest, 'authenticated', 'authenticated', 'priority-guest-' || v_guest || '@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

  insert into public.game_rooms(
    room_code, host_user_id, guest_user_id, status, format,
    host_deck_snapshot, guest_deck_snapshot, host_ready, guest_ready
  ) values (
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    v_host, v_guest, 'ready', 'original',
    pg_catalog.jsonb_build_object('name','host','cards',pg_catalog.jsonb_build_array(v_card)),
    pg_catalog.jsonb_build_object('name','guest','cards',pg_catalog.jsonb_build_array(v_card)), true, true
  ) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  select started.state, started.state_version into v_state, v_base_version from public.start_game_room(v_room) as started;
  v_state := pg_catalog.jsonb_set(v_state,'{players,p1,battle}',v_state #> '{players,p1,shield}');
  v_state := pg_catalog.jsonb_set(v_state,'{players,p1,shield}','[]'::jsonb);
  v_state := pg_catalog.jsonb_set(v_state,'{activePlayer}','"p1"'::jsonb);
  select saved.state, saved.state_version into v_state,v_base_version from public.update_game_room_state(v_room,v_base_version,v_state) saved;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  select saved.state_version into v_version
  from public.update_game_room_state(v_room, v_base_version, pg_catalog.jsonb_set(v_state || '{"winner":"guest"}'::jsonb,'{players,p1,battle,0,tapped}','true'::jsonb)) as saved;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  select saved.state, saved.state_version into v_state, v_version
  from public.update_game_room_state(v_room, v_base_version, pg_catalog.jsonb_set(v_state || '{"winner":"host"}'::jsonb,'{players,p1,battle,0,markers}','["cannot_attack"]'::jsonb)) as saved;
  if v_state ->> 'winner' <> 'host' then raise exception 'active player did not replace same-card conflict'; end if;

  v_base_version := v_version;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  select saved.state_version into v_version
  from public.update_game_room_state(v_room, v_base_version, v_state || '{"hostFirst":true}'::jsonb) as saved;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  v_conflict := false;
  begin
    perform * from public.update_game_room_state(v_room, v_base_version, v_state || '{"guestSecond":true}'::jsonb);
  exception when sqlstate '40001' then v_conflict := true;
  end;
  if not v_conflict then raise exception 'non-active player replaced active player'; end if;

  select rooms.state_version into v_base_version from public.game_rooms as rooms where rooms.id = v_room;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  select saved.state_version into v_version
  from public.update_game_room_state(
    v_room,
    v_base_version,
    pg_catalog.jsonb_set(v_state || '{"different":"guest"}'::jsonb, '{players,p1,battle,1,tapped}', 'true'::jsonb)
  ) as saved;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  v_conflict := false;
  begin
    perform * from public.update_game_room_state(
      v_room,
      v_base_version,
      pg_catalog.jsonb_set(v_state || '{"different":"host"}'::jsonb, '{players,p1,battle,0,tapped}', 'true'::jsonb)
    );
  exception when sqlstate '40001' then v_conflict := true;
  end;
  if not v_conflict then raise exception 'different-card stale update was incorrectly treated as same-card conflict'; end if;
end;
$$;

rollback;
