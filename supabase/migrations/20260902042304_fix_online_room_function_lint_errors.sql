create or replace function private.build_game_deck_snapshot(p_deck_id uuid, p_owner_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_deck public.decks%rowtype;
  v_main_count integer;
  v_cards jsonb;
  v_required_count integer;
begin
  select * into v_deck from public.decks where id = p_deck_id and owner_id = p_owner_id;
  if not found then raise exception 'deck_not_found' using errcode = 'P0002'; end if;
  v_required_count := case when v_deck.format = 'duel_party' then 60 else 40 end;
  select coalesce(pg_catalog.sum(quantity), 0::bigint)::integer into v_main_count
  from public.deck_cards where deck_id = p_deck_id and zone = 'main';
  if v_main_count <> v_required_count then raise exception 'deck_has_invalid_main_count' using errcode = '23514'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'canonicalCardId', dc.canonical_card_id,
    'cardPrintId', artwork.id,
    'name', cc.name,
    'imageKey', artwork.image_key,
    'quantity', dc.quantity,
    'zone', dc.zone,
    'sortOrder', dc.sort_order,
    'cost', cc.cost,
    'civilizations', cc.civilizations,
    'cardTypes', cc.card_types
  ) order by dc.zone, dc.sort_order, dc.id), '[]'::jsonb) into v_cards
  from public.deck_cards dc
  join public.canonical_cards cc on cc.id = dc.canonical_card_id
  left join lateral (
    select cp.id, cp.image_key from public.card_prints cp
    where cp.canonical_card_id = dc.canonical_card_id and cp.deleted_at is null
    order by (cp.id = dc.card_print_id) desc, (cp.image_key is not null) desc, cp.id limit 1
  ) artwork on true where dc.deck_id = p_deck_id;
  return pg_catalog.jsonb_build_object(
    'sourceDeckId', v_deck.id, 'name', v_deck.name, 'format', v_deck.format,
    'capturedAt', pg_catalog.now(), 'cards', v_cards
  );
end;
$$;

create or replace function public.set_game_room_ready(p_room_id uuid, p_deck_id uuid, p_ready boolean)
returns table(status text, host_ready boolean, guest_ready boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status not in ('waiting', 'ready') then
    raise exception 'room_not_readyable' using errcode = 'P0002';
  end if;
  if v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id then
    raise exception 'not_a_player' using errcode = '42501';
  end if;
  v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
  if v_snapshot ->> 'format' <> v_room.format then raise exception 'deck_format_mismatch' using errcode = '23514'; end if;

  return query update public.game_rooms as rooms
  set host_ready = case when v_user_id = rooms.host_user_id then p_ready else rooms.host_ready end,
      guest_ready = case when v_user_id = rooms.guest_user_id then p_ready else rooms.guest_ready end,
      host_deck_snapshot = case when v_user_id = rooms.host_user_id then v_snapshot else rooms.host_deck_snapshot end,
      guest_deck_snapshot = case when v_user_id = rooms.guest_user_id then v_snapshot else rooms.guest_deck_snapshot end,
      status = case
        when rooms.guest_user_id is not null
         and (case when v_user_id = rooms.host_user_id then p_ready else rooms.host_ready end)
         and (case when v_user_id = rooms.guest_user_id then p_ready else rooms.guest_ready end)
        then 'ready' else 'waiting' end,
      state_version = rooms.state_version + 1,
      updated_at = pg_catalog.now()
  where rooms.id = p_room_id
  returning rooms.status, rooms.host_ready, rooms.guest_ready;
  if not found then raise exception 'room_not_readyable' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.accept_online_lobby_invitation(p_invitation_id uuid)
returns table(lobby_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_lobby_id uuid;
begin
  update public.online_lobby_invitations
  set accepted_at = pg_catalog.now()
  where id = p_invitation_id and invitee_user_id = v_user_id
    and accepted_at is null and dismissed_at is null
  returning online_lobby_invitations.lobby_id into v_lobby_id;
  if v_lobby_id is null then raise exception 'invitation_not_available' using errcode = 'P0002'; end if;
  insert into public.online_lobby_members(lobby_id, user_id)
  values (v_lobby_id, v_user_id)
  on conflict on constraint online_lobby_members_pkey do update set last_seen_at = pg_catalog.now();
  return query select v_lobby_id;
end;
$$;

create or replace function public.request_game_room_rematch(p_room_id uuid)
returns table(status text, host_rematch_ready boolean, guest_rematch_ready boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  update public.game_rooms as rooms
  set host_rematch_ready = case when rooms.host_user_id = v_user_id then true else rooms.host_rematch_ready end,
      guest_rematch_ready = case when rooms.guest_user_id = v_user_id then true else rooms.guest_rematch_ready end,
      updated_at = pg_catalog.now()
  where rooms.id = p_room_id and rooms.status = 'finished'
    and (rooms.host_user_id = v_user_id or rooms.guest_user_id = v_user_id);
  if not found then raise exception 'rematch_not_available' using errcode = 'P0002'; end if;

  update public.game_rooms as rooms
  set status = 'ready', state = '{}'::jsonb, state_version = rooms.state_version + 1,
      started_at = null, ended_at = null, winner_user_id = null, end_reason = null,
      host_rematch_ready = false, guest_rematch_ready = false, updated_at = pg_catalog.now()
  where rooms.id = p_room_id and rooms.host_rematch_ready and rooms.guest_rematch_ready;

  return query select rooms.status, rooms.host_rematch_ready, rooms.guest_rematch_ready
  from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

revoke all on function private.build_game_deck_snapshot(uuid, uuid) from public;
revoke all on function public.set_game_room_ready(uuid, uuid, boolean) from public, anon;
revoke all on function public.accept_online_lobby_invitation(uuid) from public, anon;
revoke all on function public.request_game_room_rematch(uuid) from public, anon;
grant execute on function public.set_game_room_ready(uuid, uuid, boolean) to authenticated;
grant execute on function public.accept_online_lobby_invitation(uuid) to authenticated;
grant execute on function public.request_game_room_rematch(uuid) to authenticated;
