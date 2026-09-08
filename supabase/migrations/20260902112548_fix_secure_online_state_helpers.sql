create or replace function private.hydrate_submitted_game_state(p_submitted jsonb, p_authoritative jsonb)
returns jsonb
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  v_zones constant text[] := array['deck','hand','shield','mana','battle','graveyard','hyperspatial','gr','abyss','reveal'];
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
        v_cards := v_cards || pg_catalog.jsonb_build_array(v_card || pg_catalog.jsonb_build_object(
          'canonicalCardId',v_original -> 'canonicalCardId','name',v_original -> 'name','imageUrl',v_original -> 'imageUrl',
          'cost',v_original -> 'cost','civilizations',v_original -> 'civilizations','cardTypes',v_original -> 'cardTypes'));
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
  v_zones constant text[] := array['deck','hand','shield','mana','battle','graveyard','hyperspatial','gr','abyss','reveal'];
  v_player text; v_zone text; v_card jsonb; v_cards jsonb; v_result jsonb := p_state; v_visible boolean;
begin
  foreach v_player in array array['p1','p2'] loop
    foreach v_zone in array v_zones loop
      v_cards := '[]'::jsonb;
      for v_card in select value from pg_catalog.jsonb_array_elements(coalesce(p_state #> array['players',v_player,v_zone],'[]'::jsonb)) loop
        v_visible := v_zone <> 'deck' and (p_spectator or v_card ->> 'face' = 'face_up'
          or (v_card ->> 'face' = 'owner_only' and p_viewer = v_player)
          or (p_state -> 'inspection' ->> 'cardId' = v_card ->> 'instanceId' and p_state -> 'inspection' ->> 'viewer' = p_viewer));
        if not coalesce(v_visible,false) then
          v_card := (v_card - array['canonicalCardId','name','imageUrl','cost','civilizations','cardTypes'])
            || pg_catalog.jsonb_build_object('canonicalCardId',null,'name','非公開カード','imageUrl',null,'cost',null,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
        end if;
        v_cards := v_cards || pg_catalog.jsonb_build_array(v_card);
      end loop;
      v_result := pg_catalog.jsonb_set(v_result,array['players',v_player,v_zone],v_cards,false);
    end loop;
  end loop;
  return v_result;
end;
$$;

revoke all on function private.hydrate_submitted_game_state(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.redact_game_state(jsonb,text,boolean) from public,anon,authenticated;
