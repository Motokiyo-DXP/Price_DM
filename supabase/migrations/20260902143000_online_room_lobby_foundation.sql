-- Explicit lobby readiness and spectator membership for online matches.

alter table public.game_rooms
  add column if not exists host_ready boolean not null default false,
  add column if not exists guest_ready boolean not null default false;

alter table public.game_rooms
  drop constraint if exists game_rooms_guest_state_check;

alter table public.game_rooms
  add constraint game_rooms_guest_state_check check (
    (guest_user_id is null and guest_deck_snapshot is null and status in ('waiting', 'cancelled'))
    or
    (guest_user_id is not null and guest_deck_snapshot is not null and status in ('waiting', 'ready', 'playing', 'finished', 'cancelled'))
  );

create table if not exists public.game_room_spectators (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  primary key (room_id, user_id)
);

alter table public.game_room_spectators enable row level security;
revoke all on public.game_room_spectators from public, anon, authenticated;
grant select on public.game_room_spectators to authenticated;

create policy game_room_spectators_self_read
  on public.game_room_spectators for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists game_rooms_participant_read on public.game_rooms;
create policy game_rooms_member_read
  on public.game_rooms for select
  to authenticated
  using (
    (select auth.uid()) = host_user_id
    or (select auth.uid()) = guest_user_id
    or exists (
      select 1
      from public.game_room_spectators
      where game_room_spectators.room_id = game_rooms.id
        and game_room_spectators.user_id = (select auth.uid())
    )
  );

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

  select * into v_room
  from public.game_rooms
  where game_rooms.room_code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
  for update;

  if not found or v_room.status <> 'waiting' or v_room.expires_at <= pg_catalog.now() then
    raise exception 'room_not_available' using errcode = 'P0002';
  end if;
  if v_room.host_user_id = v_user_id then
    raise exception 'host_cannot_join_as_guest' using errcode = '23514';
  end if;
  if v_room.guest_user_id is not null then
    raise exception 'room_not_available' using errcode = 'P0002';
  end if;

  v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
  if v_snapshot ->> 'format' <> v_room.format then
    raise exception 'deck_format_mismatch' using errcode = '23514';
  end if;

  delete from public.game_room_spectators
  where game_room_spectators.room_id = v_room.id
    and game_room_spectators.user_id = v_user_id;

  update public.game_rooms
  set guest_user_id = v_user_id,
      guest_deck_snapshot = v_snapshot,
      guest_ready = false,
      status = 'waiting',
      state_version = state_version + 1,
      updated_at = pg_catalog.now()
  where game_rooms.id = v_room.id
  returning game_rooms.id, game_rooms.room_code into id, room_code;

  return next;
end;
$$;

create or replace function public.set_game_room_ready(
  p_room_id uuid,
  p_deck_id uuid,
  p_ready boolean
)
returns table(status text, host_ready boolean, guest_ready boolean)
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

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status not in ('waiting', 'ready') then
    raise exception 'room_not_readyable' using errcode = 'P0002';
  end if;
  if v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
  if v_snapshot ->> 'format' <> v_room.format then
    raise exception 'deck_format_mismatch' using errcode = '23514';
  end if;

  update public.game_rooms
  set host_ready = case when v_user_id = host_user_id then p_ready else host_ready end,
      guest_ready = case when v_user_id = guest_user_id then p_ready else guest_ready end,
      host_deck_snapshot = case when v_user_id = host_user_id then v_snapshot else host_deck_snapshot end,
      guest_deck_snapshot = case when v_user_id = guest_user_id then v_snapshot else guest_deck_snapshot end,
      status = case
        when guest_user_id is not null
         and (case when v_user_id = host_user_id then p_ready else host_ready end)
         and (case when v_user_id = guest_user_id then p_ready else guest_ready end)
        then 'ready'
        else 'waiting'
      end,
      state_version = state_version + 1,
      updated_at = pg_catalog.now()
  where id = p_room_id
  returning game_rooms.status, game_rooms.host_ready, game_rooms.guest_ready
  into status, host_ready, guest_ready;

  return next;
end;
$$;

create or replace function public.join_game_room_as_spectator(p_room_code text)
returns table(id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_room
  from public.game_rooms
  where game_rooms.room_code = pg_catalog.upper(pg_catalog.btrim(p_room_code));

  if not found or v_room.status in ('finished', 'cancelled') or v_room.expires_at <= pg_catalog.now() then
    raise exception 'room_not_available' using errcode = 'P0002';
  end if;
  if v_user_id = v_room.host_user_id or v_user_id = v_room.guest_user_id then
    return query select v_room.id, v_room.room_code;
    return;
  end if;

  insert into public.game_room_spectators(room_id, user_id)
  values (v_room.id, v_user_id)
  on conflict (room_id, user_id)
  do update set last_seen_at = pg_catalog.now();

  return query select v_room.id, v_room.room_code;
end;
$$;

drop policy if exists game_room_realtime_receive on realtime.messages;
drop policy if exists game_room_realtime_send on realtime.messages;

create policy game_room_realtime_receive
  on realtime.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.game_rooms
      where 'room:' || game_rooms.id::text = realtime.topic()
        and (
          game_rooms.host_user_id = (select auth.uid())
          or game_rooms.guest_user_id = (select auth.uid())
          or exists (
            select 1 from public.game_room_spectators
            where game_room_spectators.room_id = game_rooms.id
              and game_room_spectators.user_id = (select auth.uid())
          )
        )
    )
  );

create policy game_room_realtime_send
  on realtime.messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.game_rooms
      where 'room:' || game_rooms.id::text = realtime.topic()
        and (
          game_rooms.host_user_id = (select auth.uid())
          or game_rooms.guest_user_id = (select auth.uid())
          or exists (
            select 1 from public.game_room_spectators
            where game_room_spectators.room_id = game_rooms.id
              and game_room_spectators.user_id = (select auth.uid())
          )
        )
    )
  );

revoke all on function public.set_game_room_ready(uuid, uuid, boolean) from public, anon;
revoke all on function public.join_game_room_as_spectator(text) from public, anon;
grant execute on function public.set_game_room_ready(uuid, uuid, boolean) to authenticated;
grant execute on function public.join_game_room_as_spectator(text) to authenticated;

comment on table public.game_room_spectators is
  'Authenticated read-only spectators. Spectator membership never grants board mutation rights.';
