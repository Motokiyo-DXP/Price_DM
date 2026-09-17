begin;
do $$
declare
  v_host uuid;
  v_guest uuid := pg_catalog.gen_random_uuid();
  v_host_deck uuid;
  v_guest_deck uuid;
  v_lobby uuid;
  v_join_code text;
  v_slot uuid;
  v_room uuid;
  v_joined_lobby uuid;
  v_role text;
  v_state jsonb;
  v_version bigint;
  v_status text;
  v_host_ready boolean;
  v_guest_ready boolean;
begin
  select decks.owner_id,decks.id into v_host,v_host_deck
  from public.decks
  join public.deck_cards on deck_cards.deck_id=decks.id and deck_cards.zone='main'
  where decks.format in ('original','advanced')
  group by decks.id,decks.owner_id,decks.updated_at
  having pg_catalog.sum(deck_cards.quantity)=40
  order by decks.updated_at desc limit 1;
  if v_host is null then raise exception 'test requires one valid 40 card deck'; end if;

  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_guest,'authenticated','authenticated','two-account-'||v_guest||'@example.invalid','{}','{}',pg_catalog.now(),pg_catalog.now());
  insert into public.decks(owner_id,name,format,visibility)
  select v_guest,'E2E guest deck',format,'private' from public.decks where id=v_host_deck
  returning id into v_guest_deck;
  insert into public.deck_cards(deck_id,canonical_card_id,card_print_id,zone,quantity,sort_order)
  select v_guest_deck,canonical_card_id,card_print_id,zone,quantity,sort_order
  from public.deck_cards where deck_id=v_host_deck;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select created.id,created.join_code into v_lobby,v_join_code from public.create_online_lobby() created;
  select slots.id into v_slot from public.list_online_match_slots(v_lobby) slots where slots.slot_number=1;
  select entered.game_room_id,entered.member_role into v_room,v_role
  from public.enter_online_match_slot(v_slot,'player',v_host_deck,
    (select format from public.decks where id=v_host_deck),20::smallint) entered;
  if v_role <> 'host' or v_room is null then raise exception 'host could not create match'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_guest::text,true);
  select joined.id into v_joined_lobby from public.join_online_lobby_by_code(v_join_code) joined;
  if v_joined_lobby <> v_lobby then raise exception 'guest could not join private lobby'; end if;
  select entered.game_room_id,entered.member_role into v_room,v_role
  from public.enter_online_match_slot(v_slot,'player',v_guest_deck,
    (select format from public.decks where id=v_guest_deck),20::smallint) entered;
  if v_role <> 'guest' then raise exception 'second player did not receive guest seat'; end if;
  select ready.status,ready.host_ready,ready.guest_ready into v_status,v_host_ready,v_guest_ready
  from public.set_game_room_ready(v_room,v_guest_deck,true) ready;
  if v_status <> 'waiting' or v_host_ready or not v_guest_ready then raise exception 'guest ready transition failed'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select ready.status,ready.host_ready,ready.guest_ready into v_status,v_host_ready,v_guest_ready
  from public.set_game_room_ready(v_room,v_host_deck,true) ready;
  if v_status <> 'playing' or not v_host_ready or not v_guest_ready then raise exception 'mutual ready did not auto-start match'; end if;
  select current_state.state,current_state.state_version into v_state,v_version
  from public.get_game_room_state(v_room) current_state;
  if pg_catalog.jsonb_array_length(v_state #> '{players,p1,hand}') <> 5
     or pg_catalog.jsonb_array_length(v_state #> '{players,p1,shield}') <> 5
     or pg_catalog.jsonb_array_length(v_state #> '{players,p1,deck}') <> 30
     or pg_catalog.jsonb_array_length(v_state #> '{players,p2,hand}') <> 5
     or pg_catalog.jsonb_array_length(v_state #> '{players,p2,shield}') <> 5
     or pg_catalog.jsonb_array_length(v_state #> '{players,p2,deck}') <> 30 then
    raise exception 'server initial board counts are wrong';
  end if;
  if v_state ->> 'activePlayer' not in ('p1','p2') then raise exception 'first player was not selected'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',v_guest::text,true);
  perform public.surrender_game_room(v_room);
  select status into v_status from public.game_rooms where id=v_room;
  if v_status <> 'finished' then raise exception 'surrender did not finish match'; end if;
  perform public.request_game_room_rematch(v_room);
  perform pg_catalog.set_config('request.jwt.claim.sub',v_host::text,true);
  select rematch.status,rematch.host_rematch_ready,rematch.guest_rematch_ready
  into v_status,v_host_ready,v_guest_ready from public.request_game_room_rematch(v_room) rematch;
  if v_status <> 'ready' or v_host_ready or v_guest_ready then raise exception 'mutual rematch did not reset room'; end if;
end $$;
rollback;
