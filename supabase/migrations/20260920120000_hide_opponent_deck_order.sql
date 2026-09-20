create or replace function private.redact_game_state(p_state jsonb, p_viewer text, p_spectator boolean default false)
returns jsonb
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  v_zones constant text[] := array['deck','hand','shield','mana','battle','graveyard','hyperspatial','gr','abyss','reveal'];
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
        v_visible := case when v_zone = 'reveal'
          then p_viewer = v_player or p_state #> array['revealPublic',v_player] = 'true'::jsonb
          else v_zone <> 'deck' and (p_spectator or v_card ->> 'face' = 'face_up'
            or (v_card ->> 'face' = 'owner_only' and p_viewer = v_player)
            or (p_state -> 'inspection' ->> 'cardId' = v_card ->> 'instanceId' and p_state -> 'inspection' ->> 'viewer' = p_viewer))
          end;
        v_card := v_card - 'revealPublished';
        if not coalesce(v_visible,false) then
          v_card := (v_card - array['canonicalCardId','name','imageUrl','cost','civilizations','cardTypes'])
            || pg_catalog.jsonb_build_object('canonicalCardId',null,'name','非公開カード','imageUrl',null,'cost',null,'civilizations','[]'::jsonb,'cardTypes','[]'::jsonb);
          if v_zone = 'reveal' then v_card := v_card - 'markers'; end if;
        end if;
        if v_zone = 'deck' and (p_spectator or p_viewer <> v_player) then
          v_card := pg_catalog.jsonb_set(
            v_card,
            '{instanceId}',
            pg_catalog.to_jsonb('hidden-' || v_player || '-deck-' || v_position::text),
            true
          );
        end if;
        v_cards := v_cards || pg_catalog.jsonb_build_array(v_card);
      end loop;
      v_result := pg_catalog.jsonb_set(v_result,array['players',v_player,v_zone],v_cards,false);
    end loop;
  end loop;
  return v_result;
end;
$$;

create or replace function private.update_game_room_state_secure_impl(p_room_id uuid,p_expected_version bigint,p_state jsonb)
returns table(state jsonb,state_version bigint)
language plpgsql security definer set search_path = '' set lock_timeout = '250ms'
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current jsonb;
  v_submitted jsonb;
  v_actor text;
  v_opponent text;
begin
  select rooms.state, case when rooms.host_user_id=v_user_id then 'p1' else 'p2' end
    into v_current,v_actor from public.game_rooms as rooms
  where rooms.id=p_room_id and (rooms.host_user_id=v_user_id or rooms.guest_user_id=v_user_id)
  for update;
  if not found then raise exception 'room_access_denied' using errcode='42501'; end if;
  v_opponent := case when v_actor='p1' then 'p2' else 'p1' end;
  v_submitted := pg_catalog.jsonb_set(p_state,'{inspection}',coalesce(v_current -> 'inspection','null'::jsonb),true);
  v_submitted := pg_catalog.jsonb_set(
    v_submitted,
    array['players',v_opponent,'deck'],
    coalesce(v_current #> array['players',v_opponent,'deck'],'[]'::jsonb),
    false
  );
  v_submitted := pg_catalog.jsonb_set(v_submitted,'{revealPublic}',pg_catalog.jsonb_build_object(
    'p1',coalesce(case when v_actor='p1' then v_submitted #> '{revealPublic,p1}' = 'true'::jsonb else v_current #> '{revealPublic,p1}' = 'true'::jsonb end,false),
    'p2',coalesce(case when v_actor='p2' then v_submitted #> '{revealPublic,p2}' = 'true'::jsonb else v_current #> '{revealPublic,p2}' = 'true'::jsonb end,false)),true);
  return query select result.state,result.state_version
  from private.update_game_room_state_impl(
    p_room_id,p_expected_version,private.hydrate_submitted_game_state(v_submitted,v_current)
  ) result;
end;
$$;

revoke all on function private.redact_game_state(jsonb,text,boolean) from public,anon,authenticated;
revoke all on function private.update_game_room_state_secure_impl(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.update_game_room_state_secure_impl(uuid,bigint,jsonb) to authenticated;
