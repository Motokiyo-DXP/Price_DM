-- Retire stale match rooms without physically deleting their audit data.
-- Public lobby/slot rows remain permanent and can attach a fresh room later.

alter table public.game_rooms
  add column if not exists retired_at timestamptz,
  add column if not exists retirement_reason text,
  add constraint game_rooms_retirement_reason_check check (
    retirement_reason is null or retirement_reason in (
      'both_players_disconnected',
      'disconnect_room_inactive',
      'idle_room',
      'finished_room'
    )
  );

create index if not exists game_rooms_active_retention_idx
  on public.game_rooms(status, updated_at)
  where retired_at is null;

create or replace function private.retire_stale_game_rooms(p_now timestamptz default pg_catalog.now())
returns table(retired_room_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with presence as (
    select
      rooms.id,
      pg_catalog.max(case when p.user_id = rooms.host_user_id then p.last_seen_at end) as host_seen,
      pg_catalog.max(case when p.user_id = rooms.guest_user_id then p.last_seen_at end) as guest_seen,
      pg_catalog.max(p.last_seen_at) as latest_seen
    from public.game_rooms as rooms
    left join public.game_room_presence as p on p.room_id = rooms.id
    where rooms.retired_at is null
    group by rooms.id
  ), candidates as (
    select rooms.id,
      case
        when rooms.status = 'playing'
          and coalesce(presence.host_seen, rooms.started_at, rooms.updated_at) < p_now - interval '1 minute'
          and coalesce(presence.guest_seen, rooms.started_at, rooms.updated_at) < p_now - interval '1 minute'
          then 'both_players_disconnected'
        when rooms.status = 'finished' and rooms.end_reason = 'disconnect'
          and greatest(rooms.ended_at, coalesce(presence.latest_seen, rooms.ended_at)) < p_now - interval '5 minutes'
          then 'disconnect_room_inactive'
        when rooms.status in ('waiting', 'ready', 'cancelled')
          and greatest(rooms.updated_at, coalesce(presence.latest_seen, rooms.updated_at)) < p_now - interval '15 minutes'
          then 'idle_room'
        when rooms.status = 'finished' and rooms.end_reason is distinct from 'disconnect'
          and greatest(rooms.ended_at, coalesce(presence.latest_seen, rooms.ended_at)) < p_now - interval '15 minutes'
          then 'finished_room'
        else null
      end as reason
    from public.game_rooms as rooms
    join presence on presence.id = rooms.id
    where rooms.retired_at is null
  )
  update public.game_rooms as rooms
  set status = 'cancelled', retired_at = p_now,
      retirement_reason = candidates.reason, updated_at = p_now
  from candidates
  where rooms.id = candidates.id and candidates.reason is not null
  returning rooms.id, candidates.reason;
end;
$$;

revoke all on function private.retire_stale_game_rooms(timestamptz) from public, anon, authenticated;

create or replace function public.retire_stale_game_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select pg_catalog.count(*)::integer into v_count
  from private.retire_stale_game_rooms(pg_catalog.now());
  return v_count;
end;
$$;

revoke all on function public.retire_stale_game_rooms() from public, anon;
grant execute on function public.retire_stale_game_rooms() to authenticated;

comment on function private.retire_stale_game_rooms(timestamptz) is
  'Soft-retires rooms after both players are absent for one minute, five minutes after a disconnect result becomes inactive, or fifteen minutes of other inactivity.';
