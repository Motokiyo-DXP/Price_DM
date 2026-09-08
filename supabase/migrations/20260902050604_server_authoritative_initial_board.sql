create or replace function private.build_online_player_state(p_snapshot jsonb, p_player_id text)
returns jsonb
language sql volatile security definer set search_path = ''
as $$
  with expanded as (
    select entry.card, copies.copy_number
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'cards') as entry(card)
    cross join lateral pg_catalog.generate_series(1, (entry.card ->> 'quantity')::integer) as copies(copy_number)
    where entry.card ->> 'zone' = 'main'
  ), shuffled as (
    select card, copy_number, pg_catalog.row_number() over (order by pg_catalog.random()) as position
    from expanded
  ), instances as (
    select position, pg_catalog.jsonb_build_object(
      'instanceId', p_player_id || '-' || pg_catalog.gen_random_uuid()::text,
      'canonicalCardId', (card ->> 'canonicalCardId')::bigint,
      'name', card ->> 'name',
      'imageUrl', case when nullif(card ->> 'imageKey', '') is null then null else '/cards/' || (card ->> 'imageKey') || '.webp' end,
      'cost', case when pg_catalog.jsonb_typeof(card -> 'cost') = 'number' then card -> 'cost' else 'null'::jsonb end,
      'civilizations', coalesce(card -> 'civilizations', '[]'::jsonb),
      'cardTypes', coalesce(card -> 'cardTypes', '[]'::jsonb),
      'face', case when position between 6 and 10 then 'owner_only' else 'face_down' end,
      'tapped', false,
      'shieldMarker', null,
      'markers', '[]'::jsonb,
      'stackId', null,
      'stackOrder', null,
      'stackLayout', null,
      'stackPlacement', null
    ) as instance
    from shuffled
  )
  select pg_catalog.jsonb_build_object(
    'deck', coalesce(pg_catalog.jsonb_agg(instance order by position) filter (where position > 10), '[]'::jsonb),
    'hand', coalesce(pg_catalog.jsonb_agg(instance order by position) filter (where position between 6 and 10), '[]'::jsonb),
    'shield', coalesce(pg_catalog.jsonb_agg(instance order by position) filter (where position between 1 and 5), '[]'::jsonb),
    'mana', '[]'::jsonb, 'battle', '[]'::jsonb, 'graveyard', '[]'::jsonb,
    'hyperspatial', '[]'::jsonb, 'gr', '[]'::jsonb, 'abyss', '[]'::jsonb, 'reveal', '[]'::jsonb
  )
  from instances;
$$;

revoke all on function private.build_online_player_state(jsonb, text) from public, anon, authenticated;

drop function if exists public.start_game_room(uuid, jsonb);

create function public.start_game_room(p_room_id uuid)
returns table(state jsonb, state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_active_player text;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_user_id is null or v_room.host_user_id <> v_user_id
     or v_room.guest_user_id is null or not v_room.host_ready or not v_room.guest_ready
     or v_room.status <> 'ready' then
    raise exception 'room_not_startable' using errcode = 'P0002';
  end if;

  v_active_player := case when pg_catalog.random() < 0.5 then 'p1' else 'p2' end;
  v_state := pg_catalog.jsonb_build_object(
    'players', pg_catalog.jsonb_build_object(
      'p1', private.build_online_player_state(v_room.host_deck_snapshot, 'p1'),
      'p2', private.build_online_player_state(v_room.guest_deck_snapshot, 'p2')
    ),
    'turn', 1,
    'activePlayer', v_active_player,
    'shieldPlacementOrder', pg_catalog.jsonb_build_object('p1', 1, 'p2', 1),
    'notifications', '[]'::jsonb,
    'turnRequest', null,
    'inspection', null
  );

  return query update public.game_rooms as rooms
  set state = v_state, state_version = rooms.state_version + 1,
      status = 'playing', started_at = pg_catalog.now(), ended_at = null,
      winner_user_id = null, end_reason = null,
      host_rematch_ready = false, guest_rematch_ready = false,
      updated_at = pg_catalog.now()
  where rooms.id = p_room_id
  returning rooms.state, rooms.state_version;
end;
$$;

revoke all on function public.start_game_room(uuid) from public, anon;
grant execute on function public.start_game_room(uuid) to authenticated;
