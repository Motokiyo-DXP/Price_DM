begin;

do $$
declare
  v_host uuid;
  v_guest uuid := pg_catalog.gen_random_uuid();
  v_room uuid;
  v_status text;
  v_reason text;
begin
  select id into v_host from auth.users order by created_at limit 1;
  if v_host is null then raise exception 'test requires one existing auth user'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','lifecycle-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());

  insert into public.game_rooms(
    room_code, host_user_id, guest_user_id, status, format,
    host_deck_snapshot, guest_deck_snapshot, host_ready, guest_ready
  ) values (
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    v_host, v_guest, 'ready', 'original',
    '{"name":"host","cards":[]}'::jsonb, '{"name":"guest","cards":[]}'::jsonb, true, true
  ) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  perform * from public.start_game_room(v_room);
  perform public.surrender_game_room(v_room);
  select rooms.status, rooms.end_reason into v_status, v_reason from public.game_rooms as rooms where rooms.id = v_room;
  if v_status <> 'finished' or v_reason <> 'surrender' then
    raise exception 'surrender lifecycle failed';
  end if;

  perform public.request_game_room_rematch(v_room);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  perform public.request_game_room_rematch(v_room);
  select rooms.status into v_status from public.game_rooms as rooms where rooms.id = v_room;
  if v_status <> 'ready' then raise exception 'mutual rematch did not return room to ready'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  perform * from public.start_game_room(v_room);
  update public.game_rooms set started_at = pg_catalog.now() - interval '21 minutes' where id = v_room;
  perform * from public.reconcile_game_room_lifecycle(v_room);
  select rooms.status, rooms.end_reason into v_status, v_reason from public.game_rooms as rooms where rooms.id = v_room;
  if v_status <> 'finished' or v_reason <> 'time_limit' then
    raise exception 'time limit lifecycle failed';
  end if;
end;
$$;

rollback;
