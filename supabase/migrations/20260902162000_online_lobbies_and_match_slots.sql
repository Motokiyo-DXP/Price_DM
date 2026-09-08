-- A lobby contains multiple independent match receptions. game_rooms remains
-- the authoritative board session created from a reception when players enter.

create table public.online_lobbies (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  join_code text not null unique,
  passphrase_hash text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  constraint online_lobbies_kind_check check (kind in ('private', 'public')),
  constraint online_lobbies_code_check check (join_code ~ '^[A-F0-9]{6}$'),
  constraint online_lobbies_owner_check check (
    (kind = 'public' and owner_user_id is null)
    or (kind = 'private' and owner_user_id is not null)
  )
);

create unique index online_lobbies_single_public_idx
  on public.online_lobbies(kind)
  where kind = 'public';

create table public.online_lobby_members (
  lobby_id uuid not null references public.online_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member',
  joined_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  primary key (lobby_id, user_id),
  constraint online_lobby_members_role_check check (member_role in ('owner', 'member'))
);

create table public.online_match_slots (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.online_lobbies(id) on delete cascade,
  slot_number smallint not null,
  format text not null default 'original',
  time_limit_minutes smallint not null default 20,
  game_room_id uuid unique references public.game_rooms(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (lobby_id, slot_number),
  constraint online_match_slots_number_check check (slot_number between 1 and 10),
  constraint online_match_slots_format_check check (format in ('original', 'advanced')),
  constraint online_match_slots_time_check check (time_limit_minutes between 1 and 180)
);

create table public.online_lobby_invitations (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.online_lobbies(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  accepted_at timestamptz,
  dismissed_at timestamptz,
  constraint online_lobby_invitations_distinct_users check (inviter_user_id <> invitee_user_id)
);

create index online_lobby_invitations_inbox_idx
  on public.online_lobby_invitations(invitee_user_id, created_at desc)
  where accepted_at is null and dismissed_at is null;

alter table public.online_lobbies enable row level security;
alter table public.online_lobby_members enable row level security;
alter table public.online_match_slots enable row level security;
alter table public.online_lobby_invitations enable row level security;

revoke all on public.online_lobbies, public.online_lobby_members, public.online_match_slots, public.online_lobby_invitations from public, anon, authenticated;
grant select (id, kind, owner_user_id, join_code, created_at, updated_at, expires_at) on public.online_lobbies to authenticated;
grant select on public.online_lobby_members, public.online_match_slots, public.online_lobby_invitations to authenticated;

create policy online_lobbies_member_read on public.online_lobbies for select to authenticated
using (
  kind = 'public'
  or exists (
    select 1 from public.online_lobby_members
    where online_lobby_members.lobby_id = online_lobbies.id
      and online_lobby_members.user_id = (select auth.uid())
  )
);

create policy online_lobby_members_self_read on public.online_lobby_members for select to authenticated
using (user_id = (select auth.uid()));

create policy online_match_slots_lobby_read on public.online_match_slots for select to authenticated
using (
  exists (
    select 1 from public.online_lobbies
    where online_lobbies.id = online_match_slots.lobby_id
      and (
        online_lobbies.kind = 'public'
        or exists (
          select 1 from public.online_lobby_members
          where online_lobby_members.lobby_id = online_lobbies.id
            and online_lobby_members.user_id = (select auth.uid())
        )
      )
  )
);

create policy online_lobby_invitations_inbox_read on public.online_lobby_invitations for select to authenticated
using (invitee_user_id = (select auth.uid()));

create or replace function private.make_online_lobby_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.create_online_lobby()
returns table(id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_code text;
  v_attempt integer;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  for v_attempt in 1..10 loop
    v_code := private.make_online_lobby_code();
    begin
      insert into public.online_lobbies(kind, owner_user_id, join_code, expires_at)
      values ('private', v_user_id, v_code, pg_catalog.now() + interval '15 minutes')
      returning online_lobbies.id into v_id;
      exit;
    exception when unique_violation then
    end;
  end loop;
  if v_id is null then raise exception 'room_code_generation_failed' using errcode = 'P0001'; end if;
  insert into public.online_lobby_members(lobby_id, user_id, member_role) values (v_id, v_user_id, 'owner');
  insert into public.online_match_slots(lobby_id, slot_number)
  select v_id, value from pg_catalog.generate_series(1, 4) as value;
  return query select v_id, v_code;
end;
$$;

create or replace function public.get_public_online_lobby()
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select online_lobbies.id into v_id from public.online_lobbies where kind = 'public' limit 1;
  if v_id is null then
    insert into public.online_lobbies(kind, owner_user_id, join_code)
    values ('public', null, private.make_online_lobby_code())
    returning online_lobbies.id into v_id;
    insert into public.online_match_slots(lobby_id, slot_number)
    select v_id, value from pg_catalog.generate_series(1, 10) as value;
  end if;
  insert into public.online_lobby_members(lobby_id, user_id)
  values (v_id, v_user_id)
  on conflict (lobby_id, user_id) do update set last_seen_at = pg_catalog.now();
  return query select v_id;
end;
$$;

create or replace function public.set_online_lobby_passphrase(p_lobby_id uuid, p_passphrase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_passphrase)) not between 4 and 32 then
    raise exception 'invalid_passphrase' using errcode = '22023';
  end if;
  update public.online_lobbies
  set passphrase_hash = extensions.crypt(pg_catalog.btrim(p_passphrase), extensions.gen_salt('bf')),
      updated_at = pg_catalog.now()
  where id = p_lobby_id
    and kind = 'private'
    and exists (
      select 1 from public.online_lobby_members
      where online_lobby_members.lobby_id = p_lobby_id
        and online_lobby_members.user_id = v_user_id
    );
  if not found then raise exception 'lobby_not_available' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.join_online_lobby_with_passphrase(p_join_code text, p_passphrase text)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_lobby public.online_lobbies%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v_lobby from public.online_lobbies
  where join_code = pg_catalog.upper(pg_catalog.btrim(p_join_code))
    and kind = 'private';
  if not found
     or v_lobby.passphrase_hash is null
     or extensions.crypt(pg_catalog.btrim(p_passphrase), v_lobby.passphrase_hash) <> v_lobby.passphrase_hash then
    raise exception 'invalid_lobby_passphrase' using errcode = '42501';
  end if;
  insert into public.online_lobby_members(lobby_id, user_id)
  values (v_lobby.id, v_user_id)
  on conflict (lobby_id, user_id) do update set last_seen_at = pg_catalog.now();
  return query select v_lobby.id;
end;
$$;

create or replace function public.enter_online_match_slot(
  p_slot_id uuid,
  p_role text,
  p_deck_id uuid,
  p_format text,
  p_time_limit_minutes smallint
)
returns table(game_room_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.online_match_slots%rowtype;
  v_lobby public.online_lobbies%rowtype;
  v_room public.game_rooms%rowtype;
  v_snapshot jsonb;
  v_code text;
  v_room_id uuid;
  v_attempt integer;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_role not in ('player', 'spectator') then raise exception 'invalid_match_role' using errcode = '22023'; end if;
  if p_format not in ('original', 'advanced') then raise exception 'invalid_format' using errcode = '22023'; end if;
  if p_time_limit_minutes not between 1 and 180 then raise exception 'invalid_time_limit' using errcode = '22023'; end if;

  select * into v_slot from public.online_match_slots where id = p_slot_id for update;
  if not found then raise exception 'match_slot_not_found' using errcode = 'P0002'; end if;
  select * into v_lobby from public.online_lobbies where id = v_slot.lobby_id;
  if v_lobby.kind <> 'public' and not exists (
    select 1 from public.online_lobby_members
    where lobby_id = v_lobby.id and user_id = v_user_id
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;

  insert into public.online_lobby_members(lobby_id, user_id)
  values (v_lobby.id, v_user_id)
  on conflict (lobby_id, user_id) do update set last_seen_at = pg_catalog.now();

  if v_slot.game_room_id is not null then
    select * into v_room from public.game_rooms where id = v_slot.game_room_id for update;
  end if;

  if v_slot.game_room_id is null or not found or v_room.status in ('finished', 'cancelled') then
    if p_role = 'spectator' then raise exception 'match_not_started' using errcode = 'P0002'; end if;
    v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
    if v_snapshot ->> 'format' <> p_format then raise exception 'deck_format_mismatch' using errcode = '23514'; end if;
    for v_attempt in 1..10 loop
      v_code := private.make_online_lobby_code();
      begin
        insert into public.game_rooms(room_code, host_user_id, format, host_deck_snapshot)
        values (v_code, v_user_id, p_format, v_snapshot)
        returning id into v_room_id;
        exit;
      exception when unique_violation then
      end;
    end loop;
    if v_room_id is null then raise exception 'room_code_generation_failed' using errcode = 'P0001'; end if;
    update public.online_match_slots
    set game_room_id = v_room_id, format = p_format,
        time_limit_minutes = p_time_limit_minutes, updated_at = pg_catalog.now()
    where id = p_slot_id;
    return query select v_room_id, 'host'::text;
    return;
  end if;

  if v_room.host_user_id = v_user_id then return query select v_room.id, 'host'::text; return; end if;
  if v_room.guest_user_id = v_user_id then return query select v_room.id, 'guest'::text; return; end if;

  if p_role = 'player' and v_room.guest_user_id is null and v_room.status = 'waiting' then
    v_snapshot := private.build_game_deck_snapshot(p_deck_id, v_user_id);
    if v_snapshot ->> 'format' <> v_room.format then raise exception 'deck_format_mismatch' using errcode = '23514'; end if;
    update public.game_rooms
    set guest_user_id = v_user_id, guest_deck_snapshot = v_snapshot,
        guest_ready = false, state_version = state_version + 1, updated_at = pg_catalog.now()
    where id = v_room.id;
    return query select v_room.id, 'guest'::text;
    return;
  end if;

  insert into public.game_room_spectators(room_id, user_id)
  values (v_room.id, v_user_id)
  on conflict (room_id, user_id) do update set last_seen_at = pg_catalog.now();
  return query select v_room.id, 'spectator'::text;
end;
$$;

create or replace function public.list_online_match_slots(p_lobby_id uuid)
returns table(
  id uuid,
  slot_number smallint,
  format text,
  time_limit_minutes smallint,
  game_room_id uuid,
  status text,
  player_count integer,
  spectator_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.online_lobbies
    where online_lobbies.id = p_lobby_id
      and (
        online_lobbies.kind = 'public'
        or exists (
          select 1 from public.online_lobby_members
          where online_lobby_members.lobby_id = p_lobby_id
            and online_lobby_members.user_id = v_user_id
        )
      )
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;
  return query
  select slots.id, slots.slot_number, slots.format, slots.time_limit_minutes,
    slots.game_room_id, coalesce(rooms.status, 'empty'),
    case when rooms.id is null then 0 when rooms.guest_user_id is null then 1 else 2 end,
    pg_catalog.count(spectators.user_id)
  from public.online_match_slots as slots
  left join public.game_rooms as rooms on rooms.id = slots.game_room_id
  left join public.game_room_spectators as spectators on spectators.room_id = rooms.id
  where slots.lobby_id = p_lobby_id
  group by slots.id, rooms.id, rooms.status, rooms.guest_user_id
  order by slots.slot_number;
end;
$$;

create or replace function public.accept_online_lobby_invitation(p_invitation_id uuid)
returns table(lobby_id uuid)
language plpgsql
security definer
set search_path = ''
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
  on conflict (lobby_id, user_id) do update set last_seen_at = pg_catalog.now();
  return query select v_lobby_id;
end;
$$;

revoke all on function private.make_online_lobby_code() from public;
revoke all on function public.create_online_lobby() from public, anon;
revoke all on function public.get_public_online_lobby() from public, anon;
revoke all on function public.set_online_lobby_passphrase(uuid, text) from public, anon;
revoke all on function public.join_online_lobby_with_passphrase(text, text) from public, anon;
revoke all on function public.enter_online_match_slot(uuid, text, uuid, text, smallint) from public, anon;
revoke all on function public.list_online_match_slots(uuid) from public, anon;
revoke all on function public.accept_online_lobby_invitation(uuid) from public, anon;
grant execute on function public.create_online_lobby() to authenticated;
grant execute on function public.get_public_online_lobby() to authenticated;
grant execute on function public.set_online_lobby_passphrase(uuid, text) to authenticated;
grant execute on function public.join_online_lobby_with_passphrase(text, text) to authenticated;
grant execute on function public.enter_online_match_slot(uuid, text, uuid, text, smallint) to authenticated;
grant execute on function public.list_online_match_slots(uuid) to authenticated;
grant execute on function public.accept_online_lobby_invitation(uuid) to authenticated;
