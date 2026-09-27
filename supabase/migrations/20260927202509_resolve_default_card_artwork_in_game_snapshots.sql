-- Keep user-selected artwork in the immutable game state. Unspecified artwork
-- is resolved by the shared card-print-order helper in the client.
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
    select cp.id, cp.image_key
    from public.card_prints cp
    where cp.id = dc.card_print_id
      and cp.canonical_card_id = dc.canonical_card_id
      and cp.deleted_at is null
    limit 1
  ) artwork on true
  where dc.deck_id = p_deck_id;

  return pg_catalog.jsonb_build_object(
    'sourceDeckId', v_deck.id, 'name', v_deck.name, 'format', v_deck.format,
    'capturedAt', pg_catalog.now(), 'cards', v_cards
  );
end;
$$;

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
      'cardPrintId', case when pg_catalog.jsonb_typeof(card -> 'cardPrintId') = 'number' then (card ->> 'cardPrintId')::bigint else null end,
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

create or replace function private.hydrate_submitted_game_state(p_submitted jsonb, p_authoritative jsonb)
returns jsonb
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  v_zones constant text[] := array['deck','deckInspection','hand','shield','mana','battle','graveyard','hyperspatial','gr','abyss','reveal'];
  v_player text; v_zone text; v_card jsonb; v_original jsonb; v_cards jsonb;
  v_result jsonb := p_submitted;
  v_authoritative_map jsonb := private.game_card_map(p_authoritative);
  v_submitted_map jsonb := private.game_card_map(p_submitted);
  v_submitted_count integer; v_authoritative_unique_count integer; v_submitted_unique_count integer;
begin
  if pg_catalog.jsonb_typeof(p_submitted -> 'players') <> 'object' then
    raise exception 'invalid_game_state' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::integer into v_submitted_count from pg_catalog.jsonb_path_query(p_submitted, '$.players.*.*[*]');
  select pg_catalog.count(*)::integer into v_authoritative_unique_count from pg_catalog.jsonb_object_keys(v_authoritative_map);
  select pg_catalog.count(*)::integer into v_submitted_unique_count from pg_catalog.jsonb_object_keys(v_submitted_map);
  if v_submitted_count <> v_authoritative_unique_count
     or v_submitted_unique_count <> v_authoritative_unique_count
     or exists (select 1 from pg_catalog.jsonb_object_keys(v_submitted_map) submitted_id where not (v_authoritative_map ? submitted_id)) then
    raise exception 'game_card_set_changed' using errcode = '23514';
  end if;
  foreach v_player in array array['p1','p2'] loop
    foreach v_zone in array v_zones loop
      if pg_catalog.jsonb_typeof(p_submitted #> array['players',v_player,v_zone]) <> 'array' then
        raise exception 'invalid_game_zone' using errcode = '22023';
      end if;
      v_cards := '[]'::jsonb;
      for v_card in select value from pg_catalog.jsonb_array_elements(p_submitted #> array['players',v_player,v_zone]) loop
        v_original := v_authoritative_map -> (v_card ->> 'instanceId');
        v_card := (v_card - 'revealPublished') || pg_catalog.jsonb_build_object(
          'canonicalCardId',v_original -> 'canonicalCardId','cardPrintId',v_original -> 'cardPrintId',
          'name',v_original -> 'name','imageUrl',v_original -> 'imageUrl',
          'cost',v_original -> 'cost','civilizations',v_original -> 'civilizations','cardTypes',v_original -> 'cardTypes');
        v_cards := v_cards || pg_catalog.jsonb_build_array(v_card);
      end loop;
      v_result := pg_catalog.jsonb_set(v_result,array['players',v_player,v_zone],v_cards,false);
    end loop;
  end loop;
  return v_result;
end;
$$;

create or replace function private.redact_game_state(p_state jsonb, p_viewer text, p_spectator boolean default false)
returns jsonb
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  v_zones constant text[] := array['deck','deckInspection','hand','shield','mana','battle','graveyard','hyperspatial','gr','abyss','reveal'];
  v_player text; v_zone text; v_card jsonb; v_cards jsonb; v_result jsonb := p_state; v_visible boolean; v_position bigint;
begin
  foreach v_player in array array['p1','p2'] loop
    foreach v_zone in array v_zones loop
      v_cards := '[]'::jsonb;
      for v_card,v_position in
        select card.value,card.ordinality
        from pg_catalog.jsonb_array_elements(coalesce(p_state #> array['players',v_player,v_zone],'[]'::jsonb))
          with ordinality as card(value,ordinality)
      loop
        v_visible := case
          when v_zone = 'reveal' then p_viewer = v_player or p_state #> array['revealPublic',v_player] = 'true'::jsonb
          when v_zone = 'deckInspection' then p_viewer = v_player and not p_spectator
          else v_zone <> 'deck' and (p_spectator or v_card ->> 'face' = 'face_up'
            or (v_card ->> 'face' = 'owner_only' and p_viewer = v_player)
            or (p_state -> 'inspection' ->> 'cardId' = v_card ->> 'instanceId' and p_state -> 'inspection' ->> 'viewer' = p_viewer))
        end;
        v_card := v_card - 'revealPublished';
        if not coalesce(v_visible,false) then
          v_card := (v_card - array['canonicalCardId','cardPrintId','name','imageUrl','cost','civilizations','cardTypes'])
            || pg_catalog.jsonb_build_object('canonicalCardId',null,'cardPrintId',null,'name','非公開カード','imageUrl',null,'cost',null,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
          if v_zone = 'reveal' then v_card := v_card - 'markers'; end if;
        end if;
        if v_zone in ('deck','deckInspection') and (p_spectator or p_viewer <> v_player) then
          v_card := pg_catalog.jsonb_set(v_card,'{instanceId}',pg_catalog.to_jsonb('hidden-' || v_player || '-' || v_zone || '-' || v_position::text),true);
        end if;
        v_cards := v_cards || pg_catalog.jsonb_build_array(v_card);
      end loop;
      v_result := pg_catalog.jsonb_set(v_result,array['players',v_player,v_zone],v_cards,false);
    end loop;
  end loop;
  return v_result;
end;
$$;
