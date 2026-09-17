-- Requires a migrated local Supabase database with at least one valid 40-card
-- deck. Every write is rolled back so it can be run repeatedly.
begin;

do $$
declare
  v_a uuid;
  v_b uuid := pg_catalog.gen_random_uuid();
  v_c uuid := pg_catalog.gen_random_uuid();
  v_a_deck uuid;
  v_b_deck uuid;
  v_c_deck uuid;
  v_private_one uuid;
  v_private_two uuid;
  v_private_three uuid;
  v_public_lobby uuid;
  v_unrelated_lobby uuid;
  v_slot_one uuid;
  v_slot_two uuid;
  v_slot_three uuid;
  v_public_slot uuid;
  v_unrelated_slot uuid;
  v_room_one uuid;
  v_room_two uuid;
  v_room_three uuid;
  v_public_room uuid;
  v_unrelated_room uuid;
  v_reentry_room uuid;
  v_role text;
  v_count integer;
  v_status text;
  v_winner uuid;
  v_reason text;
begin
  select decks.owner_id, decks.id into v_a, v_a_deck
  from public.decks
  join public.deck_cards on deck_cards.deck_id = decks.id and deck_cards.zone = 'main'
  where decks.format in ('original', 'advanced')
  group by decks.owner_id, decks.id, decks.updated_at
  having pg_catalog.sum(deck_cards.quantity) = 40
  order by decks.updated_at desc
  limit 1;
  if v_a is null then raise exception 'test requires one valid 40-card deck'; end if;

  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (v_b,'authenticated','authenticated','single-match-b-' || v_b || '@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now()),
    (v_c,'authenticated','authenticated','single-match-c-' || v_c || '@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.decks(owner_id,name,format,visibility)
  select v_b, 'single match B deck', format, 'private' from public.decks where id = v_a_deck
  returning id into v_b_deck;
  insert into public.decks(owner_id,name,format,visibility)
  select v_c, 'single match C deck', format, 'private' from public.decks where id = v_a_deck
  returning id into v_c_deck;
  insert into public.deck_cards(deck_id,canonical_card_id,card_print_id,zone,quantity,sort_order)
  select v_b_deck,canonical_card_id,card_print_id,zone,quantity,sort_order from public.deck_cards where deck_id = v_a_deck;
  insert into public.deck_cards(deck_id,canonical_card_id,card_print_id,zone,quantity,sort_order)
  select v_c_deck,canonical_card_id,card_print_id,zone,quantity,sort_order from public.deck_cards where deck_id = v_a_deck;

  -- unrelated_user_unchanged
  perform pg_catalog.set_config('request.jwt.claim.sub', v_b::text, true);
  select id into v_unrelated_lobby from public.create_online_lobby();
  select id into v_unrelated_slot from public.online_match_slots where lobby_id = v_unrelated_lobby order by slot_number limit 1;
  select game_room_id into v_unrelated_room from public.enter_online_match_slot(v_unrelated_slot, 'player', v_b_deck, (select format from public.decks where id = v_b_deck), 20::smallint);

  perform pg_catalog.set_config('request.jwt.claim.sub', v_a::text, true);
  select id into v_private_one from public.create_online_lobby();
  select id into v_slot_one from public.online_match_slots where lobby_id = v_private_one order by slot_number limit 1;
  select game_room_id into v_room_one from public.enter_online_match_slot(v_slot_one, 'player', v_a_deck, (select format from public.decks where id = v_a_deck), 20::smallint);
  perform public.touch_game_room_presence(v_room_one);

  -- player_to_player
  select id into v_private_two from public.create_online_lobby();
  select id into v_slot_two from public.online_match_slots where lobby_id = v_private_two order by slot_number limit 1;
  select game_room_id into v_room_two from public.enter_online_match_slot(v_slot_two, 'player', v_a_deck, (select format from public.decks where id = v_a_deck), 20::smallint);
  select status into v_status from public.game_rooms where id = v_room_one;
  if v_status <> 'cancelled' then raise exception 'old host room was not cancelled'; end if;
  if exists (select 1 from public.game_room_presence where room_id = v_room_one and user_id = v_a) then raise exception 'old host presence remained'; end if;

  -- single_active_participation
  -- history_retained
  select pg_catalog.count(*) into v_count
  from public.online_match_slots as slots
  join public.game_rooms as rooms on rooms.id = slots.game_room_id
  where rooms.status in ('waiting','ready','playing')
    and (rooms.host_user_id = v_a or rooms.guest_user_id = v_a or exists (
      select 1 from public.game_room_spectators as spectators where spectators.room_id = rooms.id and spectators.user_id = v_a));
  if v_count <> 1 then raise exception 'expected exactly one active A participation, got %', v_count; end if;
  if not exists (select 1 from public.game_rooms where id = v_room_one) then raise exception 'old room history was deleted'; end if;
  if exists (select 1 from public.list_resumable_game_rooms() where id = v_room_one) then raise exception 'old room remained resumable'; end if;
  if (select status from public.game_rooms where id = v_unrelated_room) <> 'waiting' then raise exception 'unrelated B room changed'; end if;

  -- concurrent_requests: the migration's transaction-level advisory lock is
  -- covered by the Node regression test; this SQL test validates its final
  -- state invariant after every movement.

  -- player_to_spectator (private -> public)
  perform pg_catalog.set_config('request.jwt.claim.sub', v_c::text, true);
  select id into v_public_lobby from public.get_public_online_lobby();
  select id into v_public_slot from public.online_match_slots where lobby_id = v_public_lobby and game_room_id is null order by slot_number limit 1;
  if v_public_slot is null then raise exception 'test requires one empty public slot'; end if;
  select game_room_id into v_public_room from public.enter_online_match_slot(v_public_slot, 'player', v_c_deck, (select format from public.decks where id = v_c_deck), 20::smallint);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_a::text, true);
  perform public.get_public_online_lobby();
  select member_role into v_role from public.enter_online_match_slot(v_public_slot, 'spectator', null, (select format from public.decks where id = v_a_deck), 20::smallint);
  if v_role <> 'spectator' or not exists (select 1 from public.game_room_spectators where room_id = v_public_room and user_id = v_a) then raise exception 'A did not become public spectator'; end if;
  if exists (select 1 from public.game_room_presence where room_id = v_room_two and user_id = v_a) then raise exception 'old player presence remained'; end if;

  -- spectator_to_player (public spectator -> private player)
  select id into v_private_three from public.create_online_lobby();
  select id into v_slot_three from public.online_match_slots where lobby_id = v_private_three order by slot_number limit 1;
  select game_room_id into v_room_three from public.enter_online_match_slot(v_slot_three, 'player', v_a_deck, (select format from public.decks where id = v_a_deck), 20::smallint);
  if exists (select 1 from public.game_room_spectators where room_id = v_public_room and user_id = v_a) then raise exception 'old spectator row remained'; end if;
  if exists (select 1 from public.game_room_presence where room_id = v_public_room and user_id = v_a) then raise exception 'old spectator presence remained'; end if;

  -- same_slot_reentry and spectator_to_player within the chosen public room
  select game_room_id, member_role into v_reentry_room, v_role from public.enter_online_match_slot(v_public_slot, 'player', v_a_deck, (select format from public.decks where id = v_a_deck), 20::smallint);
  if v_reentry_room <> v_public_room or v_role <> 'guest' then raise exception 'A did not receive the public guest seat'; end if;
  if exists (select 1 from public.game_room_spectators where room_id = v_public_room and user_id = v_a) then raise exception 'spectator row survived player seat'; end if;
  select game_room_id into v_reentry_room from public.enter_online_match_slot(v_public_slot, 'player', v_a_deck, (select format from public.decks where id = v_a_deck), 20::smallint);
  if v_reentry_room <> v_public_room then raise exception 'same-slot reentry replaced the room'; end if;

  -- playing_disconnect
  -- public_slot_release
  perform pg_catalog.set_config('request.jwt.claim.sub', v_c::text, true);
  perform public.set_game_room_ready(v_public_room, v_c_deck, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_a::text, true);
  perform public.set_game_room_ready(v_public_room, v_a_deck, true);
  perform public.touch_game_room_presence(v_public_room);
  if (select status from public.game_rooms where id = v_public_room) <> 'playing' then raise exception 'public room did not start'; end if;
  select id into v_private_one from public.create_online_lobby();
  select id into v_slot_one from public.online_match_slots where lobby_id = v_private_one order by slot_number limit 1;
  perform public.enter_online_match_slot(v_slot_one, 'player', v_a_deck, (select format from public.decks where id = v_a_deck), 20::smallint);
  select status,winner_user_id,end_reason into v_status,v_winner,v_reason from public.game_rooms where id = v_public_room;
  if v_status <> 'finished' or v_winner <> v_c or v_reason <> 'disconnect' then raise exception 'playing departure did not use disconnect lifecycle'; end if;
  if exists (select 1 from public.game_room_presence where room_id = v_public_room and user_id = v_a) then raise exception 'departing player presence remained'; end if;
  if exists (select 1 from public.online_match_slots where id = v_public_slot and game_room_id is not null) then raise exception 'finished public slot was not released'; end if;
end;
$$;

rollback;
