-- Authenticated two-player room foundation. Editable decks are converted into
-- immutable JSON snapshots when each participant takes a seat.

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting',
  format text not null,
  host_deck_snapshot jsonb not null,
  guest_deck_snapshot jsonb,
  state jsonb not null default '{}'::jsonb,
  state_version bigint not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '6 hours'),
  constraint game_rooms_code_format check (room_code ~ '^[A-F0-9]{6}$'),
  constraint game_rooms_status_check check (
    status in ('waiting', 'ready', 'playing', 'finished', 'cancelled')
  ),
  constraint game_rooms_format_check check (format in ('original', 'advanced')),
  constraint game_rooms_distinct_players check (
    guest_user_id is null or guest_user_id <> host_user_id
  ),
  constraint game_rooms_guest_state_check check (
    (guest_user_id is null and guest_deck_snapshot is null and status in ('waiting', 'cancelled'))
    or
    (guest_user_id is not null and guest_deck_snapshot is not null and status in ('ready', 'playing', 'finished', 'cancelled'))
  ),
  constraint game_rooms_snapshot_shapes check (
    pg_catalog.jsonb_typeof(host_deck_snapshot) = 'object'
    and (
      guest_deck_snapshot is null
      or pg_catalog.jsonb_typeof(guest_deck_snapshot) = 'object'
    )
  ),
  constraint game_rooms_state_shape check (pg_catalog.jsonb_typeof(state) = 'object'),
  constraint game_rooms_state_version_check check (state_version >= 0),
  constraint game_rooms_expiry_check check (expires_at > created_at)
);

create index game_rooms_host_recent_idx
  on public.game_rooms(host_user_id, updated_at desc);
create index game_rooms_guest_recent_idx
  on public.game_rooms(guest_user_id, updated_at desc)
  where guest_user_id is not null;
create index game_rooms_waiting_expiry_idx
  on public.game_rooms(expires_at)
  where status = 'waiting';

alter table public.game_rooms enable row level security;

create policy game_rooms_participant_read
  on public.game_rooms for select
  to authenticated
  using (
    (select auth.uid()) = host_user_id
    or (select auth.uid()) = guest_user_id
  );

revoke all on public.game_rooms from public, anon, authenticated;
grant select on public.game_rooms to authenticated;

create or replace function private.build_game_deck_snapshot(
  p_deck_id uuid,
  p_owner_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_deck public.decks%rowtype;
  v_main_count integer;
  v_cards jsonb;
begin
  select *
  into v_deck
  from public.decks
  where id = p_deck_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'deck_not_found' using errcode = 'P0002';
  end if;

  select pg_catalog.coalesce(pg_catalog.sum(quantity), 0)::integer
  into v_main_count
  from public.deck_cards
  where deck_id = p_deck_id
    and zone = 'main';

  if v_main_count <> 40 then
    raise exception 'deck_must_have_40_main_cards' using errcode = '23514';
  end if;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'canonicalCardId', deck_cards.canonical_card_id,
        'cardPrintId', artwork.id,
        'name', canonical_cards.name,
        'imageKey', artwork.image_key,
        'quantity', deck_cards.quantity,
        'zone', deck_cards.zone,
        'sortOrder', deck_cards.sort_order
      )
      order by deck_cards.zone, deck_cards.sort_order, deck_cards.id
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.deck_cards
  join public.canonical_cards
    on canonical_cards.id = deck_cards.canonical_card_id
  left join lateral (
    select card_prints.id, card_prints.image_key
    from public.card_prints
    where card_prints.canonical_card_id = deck_cards.canonical_card_id
      and card_prints.deleted_at is null
    order by
      (card_prints.id = deck_cards.card_print_id) desc,
      (card_prints.image_key is not null) desc,
      card_prints.id
    limit 1
  ) as artwork on true
  where deck_cards.deck_id = p_deck_id;

  return pg_catalog.jsonb_build_object(
    'sourceDeckId', v_deck.id,
    'name', v_deck.name,
    'format', v_deck.format,
    'capturedAt', pg_catalog.now(),
    'cards', v_cards
  );
end;
$$;

revoke all on function private.build_game_deck_snapshot(uuid, uuid) from public;

create or replace function public.create_game_room(p_deck_id uuid)
returns table(id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_snapshot jsonb;
  v_format text;
  v_code text;
  v_room_id uuid;
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
  v_format := v_snapshot ->> 'format';

  for v_attempt in 1..10 loop
    v_code := pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6
    ));
    begin
      insert into public.game_rooms(
        room_code,
        host_user_id,
        format,
        host_deck_snapshot
      )
      values (v_code, v_user_id, v_format, v_snapshot)
      returning game_rooms.id into v_room_id;

      return query select v_room_id, v_code;
      return;
    exception when unique_violation then
      -- Generate another short code if the previous one already exists.
    end;
  end loop;

  raise exception 'room_code_generation_failed' using errcode = 'P0001';
end;
$$;

create or replace function public.join_game_room(
  p_room_code text,
  p_deck_id uuid
)
returns table(id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
  into v_room
  from public.game_rooms
  where game_rooms.room_code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
  for update;

  if not found or v_room.status <> 'waiting' or v_room.expires_at <= pg_catalog.now() then
    raise exception 'room_not_available' using errcode = 'P0002';
  end if;
  if v_room.host_user_id = v_user_id then
    raise exception 'host_cannot_join_as_guest' using errcode = '23514';
  end if;

  v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
  if v_snapshot ->> 'format' <> v_room.format then
    raise exception 'deck_format_mismatch' using errcode = '23514';
  end if;

  update public.game_rooms
  set
    guest_user_id = v_user_id,
    guest_deck_snapshot = v_snapshot,
    status = 'ready',
    state_version = state_version + 1,
    updated_at = pg_catalog.now()
  where game_rooms.id = v_room.id
  returning game_rooms.id, game_rooms.room_code
  into id, room_code;

  return next;
end;
$$;

revoke all on function public.create_game_room(uuid) from public, anon;
revoke all on function public.join_game_room(text, uuid) from public, anon;
grant execute on function public.create_game_room(uuid) to authenticated;
grant execute on function public.join_game_room(text, uuid) to authenticated;

-- Private Realtime channels use topics in the form room:<room UUID>. Realtime
-- owns this schema; only authorization policies are intentionally added here.
create policy game_room_realtime_receive
  on realtime.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.game_rooms
      where 'room:' || game_rooms.id::text = realtime.topic()
        and (
          game_rooms.host_user_id = (select auth.uid())
          or game_rooms.guest_user_id = (select auth.uid())
        )
    )
  );

create policy game_room_realtime_send
  on realtime.messages for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.game_rooms
      where 'room:' || game_rooms.id::text = realtime.topic()
        and (
          game_rooms.host_user_id = (select auth.uid())
          or game_rooms.guest_user_id = (select auth.uid())
        )
    )
  );

comment on table public.game_rooms is
  'Two-player authenticated game rooms with immutable deck snapshots and participant-only access.';
