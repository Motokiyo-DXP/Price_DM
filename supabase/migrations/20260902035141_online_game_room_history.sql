create table public.game_room_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  action_kind text not null default 'board_update' check (action_kind in ('board_update', 'turn_end')),
  before_state jsonb not null,
  after_state jsonb not null,
  applied boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  undone_at timestamptz
);

create index game_room_actions_room_applied_id_idx on public.game_room_actions(room_id, applied, id desc);
create index game_room_actions_room_turn_idx on public.game_room_actions(room_id, turn_number);

create table public.game_room_undo_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  action_id bigint not null references public.game_room_actions(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  responder_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default pg_catalog.now(),
  responded_at timestamptz
);

create unique index game_room_undo_requests_one_pending_per_action_idx
  on public.game_room_undo_requests(action_id) where status = 'pending';

alter table public.game_room_actions enable row level security;
alter table public.game_room_undo_requests enable row level security;
revoke all on public.game_room_actions from public, anon, authenticated;
revoke all on public.game_room_undo_requests from public, anon, authenticated;

create or replace function public.start_game_room(p_room_id uuid, p_initial_state jsonb)
returns table(state jsonb, state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_initial_state) <> 'object' or not (p_initial_state ? 'players') then
    raise exception 'invalid_game_state' using errcode = '22023';
  end if;
  return query update public.game_rooms
  set state = p_initial_state, state_version = game_rooms.state_version + 1,
      status = 'playing', started_at = pg_catalog.now(), ended_at = null,
      winner_user_id = null, end_reason = null,
      host_rematch_ready = false, guest_rematch_ready = false,
      updated_at = pg_catalog.now()
  where id = p_room_id and host_user_id = v_user_id and guest_user_id is not null
    and host_ready and guest_ready and status = 'ready'
  returning game_rooms.state, game_rooms.state_version;
  if not found then raise exception 'room_not_startable' using errcode = 'P0002'; end if;
  delete from public.game_room_actions where room_id = p_room_id;
end;
$$;

create or replace function public.update_game_room_state(p_room_id uuid, p_expected_version bigint, p_state jsonb)
returns table(state jsonb, state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_action_kind text := 'board_update';
  v_actor_user_id uuid;
  v_turn_number integer;
  v_requested_by text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_state) <> 'object' or not (p_state ? 'players') then
    raise exception 'invalid_game_state' using errcode = '22023';
  end if;

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version then
    raise exception 'game_state_conflict' using errcode = '40001';
  end if;
  if v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;

  v_actor_user_id := v_user_id;
  v_turn_number := greatest(1, coalesce((v_room.state ->> 'turn')::integer, 1));
  if coalesce((p_state ->> 'turn')::integer, v_turn_number) = v_turn_number + 1
     and p_state ->> 'activePlayer' is distinct from v_room.state ->> 'activePlayer' then
    v_requested_by := v_room.state #>> '{turnRequest,requestedBy}';
    if v_requested_by in ('p1', 'p2') then
      v_action_kind := 'turn_end';
      v_actor_user_id := case when v_requested_by = 'p1' then v_room.host_user_id else v_room.guest_user_id end;
    end if;
  end if;

  delete from public.game_room_actions where room_id = p_room_id and not applied;
  update public.game_room_undo_requests set status = 'expired', responded_at = pg_catalog.now()
  where room_id = p_room_id and status = 'pending';
  update public.game_rooms set state = p_state, state_version = game_rooms.state_version + 1, updated_at = pg_catalog.now()
  where id = p_room_id;
  insert into public.game_room_actions(room_id, actor_user_id, submitted_by_user_id, turn_number, action_kind, before_state, after_state)
  values (p_room_id, v_actor_user_id, v_user_id, v_turn_number, v_action_kind, v_room.state, p_state);
  delete from public.game_room_actions
  where room_id = p_room_id and turn_number < greatest(1, coalesce((p_state ->> 'turn')::integer, v_turn_number) - 1);
  return query select rooms.state, rooms.state_version from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

create or replace function public.get_game_room_history_status(p_room_id uuid)
returns table(can_undo boolean, can_redo boolean, undo_requires_approval boolean, pending_request_id uuid, pending_requester_name text)
language plpgsql security definer set search_path = '' stable
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_undo public.game_room_actions%rowtype;
  v_redo public.game_room_actions%rowtype;
begin
  select * into v_room from public.game_rooms where id = p_room_id;
  if not found or v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;
  select * into v_undo from public.game_room_actions where room_id = p_room_id and applied order by id desc limit 1;
  select * into v_redo from public.game_room_actions where room_id = p_room_id and not applied order by id asc limit 1;
  return query
  select
    v_undo.id is not null and v_undo.actor_user_id = v_user_id and v_room.state = v_undo.after_state,
    v_redo.id is not null and v_redo.actor_user_id = v_user_id and v_room.state = v_redo.before_state,
    v_undo.id is not null and v_undo.actor_user_id = v_user_id and v_undo.action_kind = 'turn_end',
    requests.id,
    coalesce(profiles.display_name, '対戦相手')
  from (select 1) as singleton
  left join public.game_room_undo_requests as requests
    on requests.room_id = p_room_id and requests.responder_user_id = v_user_id and requests.status = 'pending'
  left join public.profiles as profiles on profiles.user_id = requests.requester_user_id
  order by requests.created_at desc nulls last limit 1;
end;
$$;

create or replace function public.undo_game_room_action(p_room_id uuid, p_expected_version bigint)
returns table(state jsonb, state_version bigint, result text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_action public.game_room_actions%rowtype;
  v_responder uuid;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version then
    raise exception 'game_state_conflict' using errcode = '40001';
  end if;
  if v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;
  select * into v_action from public.game_room_actions
  where room_id = p_room_id and applied order by id desc limit 1 for update;
  if not found or v_action.actor_user_id <> v_user_id or v_room.state <> v_action.after_state then
    raise exception 'undo_not_available' using errcode = 'P0002';
  end if;
  if v_action.action_kind = 'turn_end' then
    v_responder := case when v_user_id = v_room.host_user_id then v_room.guest_user_id else v_room.host_user_id end;
    insert into public.game_room_undo_requests(room_id, action_id, requester_user_id, responder_user_id)
    values (p_room_id, v_action.id, v_user_id, v_responder)
    on conflict (action_id) where status = 'pending' do nothing;
    update public.game_rooms set updated_at = pg_catalog.now() where id = p_room_id;
    return query select v_room.state, v_room.state_version, 'approval_required'::text;
    return;
  end if;
  update public.game_room_actions set applied = false, undone_at = pg_catalog.now() where id = v_action.id;
  update public.game_rooms set state = v_action.before_state, state_version = game_rooms.state_version + 1, updated_at = pg_catalog.now()
  where id = p_room_id;
  return query select rooms.state, rooms.state_version, 'undone'::text from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

create or replace function public.redo_game_room_action(p_room_id uuid, p_expected_version bigint)
returns table(state jsonb, state_version bigint, result text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_action public.game_room_actions%rowtype;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version then
    raise exception 'game_state_conflict' using errcode = '40001';
  end if;
  if v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;
  select * into v_action from public.game_room_actions
  where room_id = p_room_id and not applied order by id asc limit 1 for update;
  if not found or v_action.actor_user_id <> v_user_id or v_room.state <> v_action.before_state then
    raise exception 'redo_not_available' using errcode = 'P0002';
  end if;
  update public.game_room_actions set applied = true, undone_at = null where id = v_action.id;
  update public.game_rooms set state = v_action.after_state, state_version = game_rooms.state_version + 1, updated_at = pg_catalog.now()
  where id = p_room_id;
  return query select rooms.state, rooms.state_version, 'redone'::text from public.game_rooms as rooms where rooms.id = p_room_id;
end;
$$;

create or replace function public.respond_game_room_undo_request(p_request_id uuid, p_approve boolean, p_expected_version bigint)
returns table(state jsonb, state_version bigint, result text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.game_room_undo_requests%rowtype;
  v_action public.game_room_actions%rowtype;
  v_room public.game_rooms%rowtype;
begin
  select * into v_request from public.game_room_undo_requests where id = p_request_id and status = 'pending' for update;
  if not found or v_user_id is null or v_request.responder_user_id <> v_user_id then
    raise exception 'undo_request_not_available' using errcode = '42501';
  end if;
  select * into v_room from public.game_rooms where id = v_request.room_id for update;
  if v_room.status <> 'playing' or v_room.state_version <> p_expected_version then
    raise exception 'game_state_conflict' using errcode = '40001';
  end if;
  select * into v_action from public.game_room_actions where id = v_request.action_id for update;
  if not p_approve then
    update public.game_room_undo_requests set status = 'rejected', responded_at = pg_catalog.now() where id = p_request_id;
    update public.game_rooms set updated_at = pg_catalog.now() where id = v_room.id;
    return query select v_room.state, v_room.state_version, 'rejected'::text;
    return;
  end if;
  if not v_action.applied or v_room.state <> v_action.after_state
     or exists (select 1 from public.game_room_actions where room_id = v_room.id and applied and id > v_action.id) then
    update public.game_room_undo_requests set status = 'expired', responded_at = pg_catalog.now() where id = p_request_id;
    raise exception 'undo_request_expired' using errcode = 'P0002';
  end if;
  update public.game_room_actions set applied = false, undone_at = pg_catalog.now() where id = v_action.id;
  update public.game_room_undo_requests set status = 'approved', responded_at = pg_catalog.now() where id = p_request_id;
  update public.game_rooms set state = v_action.before_state, state_version = game_rooms.state_version + 1, updated_at = pg_catalog.now()
  where id = v_room.id;
  return query select rooms.state, rooms.state_version, 'approved'::text from public.game_rooms as rooms where rooms.id = v_room.id;
end;
$$;

revoke all on function public.update_game_room_state(uuid, bigint, jsonb) from public, anon;
revoke all on function public.start_game_room(uuid, jsonb) from public, anon;
revoke all on function public.get_game_room_history_status(uuid) from public, anon;
revoke all on function public.undo_game_room_action(uuid, bigint) from public, anon;
revoke all on function public.redo_game_room_action(uuid, bigint) from public, anon;
revoke all on function public.respond_game_room_undo_request(uuid, boolean, bigint) from public, anon;
grant execute on function public.update_game_room_state(uuid, bigint, jsonb) to authenticated;
grant execute on function public.start_game_room(uuid, jsonb) to authenticated;
grant execute on function public.get_game_room_history_status(uuid) to authenticated;
grant execute on function public.undo_game_room_action(uuid, bigint) to authenticated;
grant execute on function public.redo_game_room_action(uuid, bigint) to authenticated;
grant execute on function public.respond_game_room_undo_request(uuid, boolean, bigint) to authenticated;
