-- Preserve the latest identity redaction, including cardPrintId.
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
            or (v_zone = 'hand' and v_card ->> 'face' = 'face_down' and p_viewer <> v_player)
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
