begin;

do $$
declare
  v_host uuid;
  v_guest uuid;
  v_room uuid;
  v_version bigint;
  v_state jsonb;
  v_result text;
  v_request uuid;
  v_denied boolean := false;
begin
  select id into v_host from auth.users order by created_at limit 1;
  select id into v_guest from auth.users where id <> v_host order by created_at limit 1;
  if v_host is null then
    v_host := gen_random_uuid();
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_host, 'authenticated', 'authenticated', 'history-host@example.invalid', '{}'::jsonb, '{"display_name":"履歴テストホスト"}'::jsonb, pg_catalog.now(), pg_catalog.now());
  end if;
  if v_guest is null then
    v_guest := gen_random_uuid();
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_guest, 'authenticated', 'authenticated', 'history-guest@example.invalid', '{}'::jsonb, '{"display_name":"履歴テストゲスト"}'::jsonb, pg_catalog.now(), pg_catalog.now());
  end if;

  insert into public.game_rooms(
    room_code, host_user_id, guest_user_id, status, format,
    host_deck_snapshot, guest_deck_snapshot, host_ready, guest_ready
  ) values (
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    v_host, v_guest, 'ready', 'original',
    '{"name":"host","cards":[]}'::jsonb, '{"name":"guest","cards":[]}'::jsonb, true, true
  ) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  select started.state, started.state_version into v_state, v_version
  from public.start_game_room(v_room) as started;
  v_state := pg_catalog.jsonb_set(v_state, '{activePlayer}', '"p1"'::jsonb);

  select saved.state_version into v_version
  from public.update_game_room_state(v_room, v_version, v_state || '{"step":1}'::jsonb) as saved;
  select undone.state, undone.state_version, undone.result into v_state, v_version, v_result
  from public.undo_game_room_action(v_room, v_version) as undone;
  if v_result <> 'undone' or v_state ? 'step' then raise exception 'normal undo failed'; end if;
  select redone.state, redone.state_version, redone.result into v_state, v_version, v_result
  from public.redo_game_room_action(v_room, v_version) as redone;
  if v_result <> 'redone' or v_state ->> 'step' <> '1' then raise exception 'normal redo failed'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  select state into v_state from public.get_game_room_state(v_room);
  select saved.state_version into v_version
  from public.update_game_room_state(v_room, v_version, v_state || '{"step":2}'::jsonb) as saved;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  begin
    perform * from public.undo_game_room_action(v_room, v_version);
  exception when sqlstate 'P0002' then
    v_denied := true;
  end;
  if not v_denied then raise exception 'a player undid the opponent action'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  select state into v_state from public.get_game_room_state(v_room);
  select saved.state_version into v_version
  from public.update_game_room_state(v_room, v_version, pg_catalog.jsonb_set(v_state, '{turnRequest}', '{"requestedBy":"p1","status":"pending"}'::jsonb)) as saved;
  select state into v_state from public.get_game_room_state(v_room);
  select saved.state_version into v_version
  from public.update_game_room_state(v_room, v_version, pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_state, '{turn}', '2'::jsonb), '{activePlayer}', '"p2"'::jsonb), '{turnRequest}', 'null'::jsonb)) as saved;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  select undone.result into v_result from public.undo_game_room_action(v_room, v_version) as undone;
  if v_result <> 'approval_required' then raise exception 'turn end undo skipped approval'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  select status.pending_request_id into v_request
  from public.get_game_room_history_status(v_room) as status;
  if v_request is null then raise exception 'opponent did not receive undo approval request'; end if;
  select response.state, response.state_version, response.result into v_state, v_version, v_result
  from public.respond_game_room_undo_request(v_request, true, v_version) as response;
  if v_result <> 'approved' or v_state ->> 'turn' <> '1' then raise exception 'approved turn undo failed'; end if;
end;
$$;

rollback;
