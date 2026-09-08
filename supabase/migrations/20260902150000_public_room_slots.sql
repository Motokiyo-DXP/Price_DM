-- Ten permanent public-room slots. A slot remains visible even when no active
-- game room is attached to it.

create table public.game_public_slots (
  slot_number smallint primary key,
  room_id uuid unique references public.game_rooms(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint game_public_slots_number_check check (slot_number between 1 and 10)
);

insert into public.game_public_slots(slot_number)
select value from pg_catalog.generate_series(1, 10) as value
on conflict (slot_number) do nothing;

alter table public.game_public_slots enable row level security;
revoke all on public.game_public_slots from public, anon, authenticated;
grant select on public.game_public_slots to authenticated;

create policy game_public_slots_authenticated_read
  on public.game_public_slots for select
  to authenticated
  using (true);

create or replace function public.list_public_game_rooms()
returns table(
  slot_number smallint,
  room_id uuid,
  room_code text,
  status text,
  format text,
  player_count integer,
  spectator_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    slots.slot_number,
    rooms.id,
    rooms.room_code,
    coalesce(rooms.status, 'empty'),
    rooms.format,
    case
      when rooms.id is null then 0
      when rooms.guest_user_id is null then 1
      else 2
    end,
    pg_catalog.count(spectators.user_id)
  from public.game_public_slots as slots
  left join public.game_rooms as rooms on rooms.id = slots.room_id
  left join public.game_room_spectators as spectators on spectators.room_id = rooms.id
  group by slots.slot_number, rooms.id, rooms.room_code, rooms.status, rooms.format, rooms.guest_user_id
  order by slots.slot_number;
$$;

create or replace function public.enter_public_game_room(
  p_slot_number smallint,
  p_deck_id uuid
)
returns table(id uuid, room_code text, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.game_public_slots%rowtype;
  v_room public.game_rooms%rowtype;
  v_snapshot jsonb;
  v_code text;
  v_room_id uuid;
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_slot_number < 1 or p_slot_number > 10 then
    raise exception 'invalid_public_slot' using errcode = '22023';
  end if;

  select * into v_slot
  from public.game_public_slots
  where game_public_slots.slot_number = p_slot_number
  for update;

  if v_slot.room_id is not null then
    select * into v_room from public.game_rooms where game_rooms.id = v_slot.room_id for update;
  end if;

  if v_slot.room_id is null
     or not found
     or v_room.status in ('finished', 'cancelled')
     or v_room.expires_at <= pg_catalog.now() then
    v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
    for v_attempt in 1..10 loop
      v_code := pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));
      begin
        insert into public.game_rooms(room_code, host_user_id, format, host_deck_snapshot)
        values (v_code, v_user_id, v_snapshot ->> 'format', v_snapshot)
        returning game_rooms.id into v_room_id;
        exit;
      exception when unique_violation then
      end;
    end loop;
    if v_room_id is null then
      raise exception 'room_code_generation_failed' using errcode = 'P0001';
    end if;
    update public.game_public_slots
    set room_id = v_room_id, updated_at = pg_catalog.now()
    where game_public_slots.slot_number = p_slot_number;
    return query select v_room_id, v_code, 'host'::text;
    return;
  end if;

  if v_room.host_user_id = v_user_id then
    return query select v_room.id, v_room.room_code, 'host'::text;
    return;
  end if;
  if v_room.guest_user_id = v_user_id then
    return query select v_room.id, v_room.room_code, 'guest'::text;
    return;
  end if;
  if exists (
    select 1 from public.game_room_spectators
    where game_room_spectators.room_id = v_room.id
      and game_room_spectators.user_id = v_user_id
  ) then
    return query select v_room.id, v_room.room_code, 'spectator'::text;
    return;
  end if;

  if v_room.guest_user_id is null and v_room.status = 'waiting' then
    v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
    if v_snapshot ->> 'format' <> v_room.format then
      raise exception 'deck_format_mismatch' using errcode = '23514';
    end if;
    update public.game_rooms
    set guest_user_id = v_user_id,
        guest_deck_snapshot = v_snapshot,
        guest_ready = false,
        state_version = state_version + 1,
        updated_at = pg_catalog.now()
    where game_rooms.id = v_room.id;
    return query select v_room.id, v_room.room_code, 'guest'::text;
    return;
  end if;

  insert into public.game_room_spectators(room_id, user_id)
  values (v_room.id, v_user_id)
  on conflict (room_id, user_id)
  do update set last_seen_at = pg_catalog.now();
  return query select v_room.id, v_room.room_code, 'spectator'::text;
end;
$$;

revoke all on function public.list_public_game_rooms() from public, anon;
revoke all on function public.enter_public_game_room(smallint, uuid) from public, anon;
grant execute on function public.list_public_game_rooms() to authenticated;
grant execute on function public.enter_public_game_room(smallint, uuid) to authenticated;

comment on table public.game_public_slots is
  'Permanent public matchmaking slots. Active game rooms may be replaced after expiry or completion.';
