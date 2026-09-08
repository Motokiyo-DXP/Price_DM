begin;

do $$
declare
  v_card jsonb := pg_catalog.jsonb_build_object(
    'instanceId','p1-secret','canonicalCardId',7,'name','秘密','imageUrl','/secret.webp',
    'cost',3,'civilizations',pg_catalog.jsonb_build_array('nature'),
    'cardTypes',pg_catalog.jsonb_build_array('クリーチャー'),'face','owner_only',
    'tapped',false,'shieldMarker',null,'markers','[]'::jsonb
  );
  v_empty jsonb := pg_catalog.jsonb_build_object('deck','[]'::jsonb,'hand','[]'::jsonb,'shield','[]'::jsonb,'mana','[]'::jsonb,'battle','[]'::jsonb,'graveyard','[]'::jsonb,'hyperspatial','[]'::jsonb,'gr','[]'::jsonb,'abyss','[]'::jsonb,'reveal','[]'::jsonb);
  v_state jsonb;
  v_redacted jsonb;
  v_submitted jsonb;
  v_hydrated jsonb;
begin
  v_state := pg_catalog.jsonb_build_object('players',pg_catalog.jsonb_build_object(
    'p1',pg_catalog.jsonb_set(v_empty,'{hand}',pg_catalog.jsonb_build_array(v_card)),
    'p2',v_empty
  ),'turn',1,'activePlayer','p1','inspection',null);

  v_redacted := private.redact_game_state(v_state,'p2',false);
  if v_redacted #>> '{players,p1,hand,0,name}' <> '非公開カード'
     or v_redacted #>> '{players,p1,hand,0,instanceId}' <> 'p1-secret' then
    raise exception 'opponent hand was not safely redacted';
  end if;
  if private.redact_game_state(v_state,'p1',false) #>> '{players,p1,hand,0,name}' <> '秘密' then
    raise exception 'owner hand was incorrectly redacted';
  end if;

  v_submitted := pg_catalog.jsonb_set(v_redacted,'{players,p1,hand,0,tapped}','true'::jsonb);
  v_hydrated := private.hydrate_submitted_game_state(v_submitted,v_state);
  if v_hydrated #>> '{players,p1,hand,0,name}' <> '秘密'
     or (v_hydrated #>> '{players,p1,hand,0,tapped}')::boolean is not true then
    raise exception 'server identity hydration failed';
  end if;

  begin
    perform private.hydrate_submitted_game_state(
      pg_catalog.jsonb_set(v_submitted,'{players,p2,hand}',pg_catalog.jsonb_build_array(v_card || pg_catalog.jsonb_build_object('instanceId','forged'))),
      v_state
    );
    raise exception 'forged card was accepted';
  exception when check_violation then null;
  end;
end;
$$;

rollback;
