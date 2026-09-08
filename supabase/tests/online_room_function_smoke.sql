begin;

do $$
declare
  v_host uuid;
  v_guest uuid := gen_random_uuid();
  v_deck uuid;
  v_snapshot jsonb;
  v_room uuid;
  v_lobby uuid;
  v_invitation uuid;
  v_status text;
  v_host_ready boolean;
  v_guest_ready boolean;
  v_result_lobby uuid;
begin
  select decks.owner_id, decks.id into v_host, v_deck
  from public.decks
  join public.deck_cards on deck_cards.deck_id = decks.id and deck_cards.zone = 'main'
  group by decks.id, decks.owner_id, decks.format, decks.updated_at
  having pg_catalog.sum(deck_cards.quantity) = case when decks.format = 'duel_party' then 60 else 40 end
  order by decks.updated_at desc limit 1;
  if v_host is null then raise exception 'valid test deck not found'; end if;

  insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_guest, 'authenticated', 'authenticated', 'online-room-smoke@example.invalid', '{}'::jsonb, '{"display_name":"オンライン関数テスト"}'::jsonb, pg_catalog.now(), pg_catalog.now());

  v_snapshot := private.build_game_deck_snapshot(v_deck, v_host);
  if pg_catalog.jsonb_array_length(v_snapshot -> 'cards') = 0 then raise exception 'deck snapshot is empty'; end if;

  insert into public.game_rooms(room_code, host_user_id, guest_user_id, status, format, host_deck_snapshot, guest_deck_snapshot)
  values (
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    v_host, v_guest, 'waiting', v_snapshot ->> 'format', v_snapshot, v_snapshot
  ) returning id into v_room;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_host::text, true);
  select ready.status, ready.host_ready, ready.guest_ready into v_status, v_host_ready, v_guest_ready
  from public.set_game_room_ready(v_room, v_deck, true) as ready;
  if v_status <> 'waiting' or not v_host_ready or v_guest_ready then raise exception 'set ready failed'; end if;

  update public.game_rooms set status = 'finished' where id = v_room;
  select rematch.status, rematch.host_rematch_ready into v_status, v_host_ready
  from public.request_game_room_rematch(v_room) as rematch;
  if v_status <> 'finished' or not v_host_ready then raise exception 'host rematch request failed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_guest::text, true);
  select rematch.status, rematch.host_rematch_ready, rematch.guest_rematch_ready into v_status, v_host_ready, v_guest_ready
  from public.request_game_room_rematch(v_room) as rematch;
  if v_status <> 'ready' or v_host_ready or v_guest_ready then raise exception 'mutual rematch failed'; end if;

  insert into public.online_lobbies(kind, owner_user_id, join_code)
  values ('private', v_host, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6)))
  returning id into v_lobby;
  insert into public.online_lobby_members(lobby_id, user_id, member_role) values (v_lobby, v_host, 'owner');
  insert into public.online_lobby_invitations(lobby_id, inviter_user_id, invitee_user_id)
  values (v_lobby, v_host, v_guest) returning id into v_invitation;
  select accepted.lobby_id into v_result_lobby
  from public.accept_online_lobby_invitation(v_invitation) as accepted;
  if v_result_lobby <> v_lobby or not exists (
    select 1 from public.online_lobby_members where lobby_id = v_lobby and user_id = v_guest
  ) then raise exception 'invitation acceptance failed'; end if;
end;
$$;

rollback;
