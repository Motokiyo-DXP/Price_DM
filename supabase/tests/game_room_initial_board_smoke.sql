begin;

do $$
declare
  v_card jsonb := pg_catalog.jsonb_build_object(
    'canonicalCardId', 1, 'name', 'test', 'imageKey', null,
    'quantity', 40, 'zone', 'main', 'cost', 3,
    'civilizations', pg_catalog.jsonb_build_array('nature'),
    'cardTypes', pg_catalog.jsonb_build_array('クリーチャー')
  );
  v_player jsonb;
begin
  v_player := private.build_online_player_state(
    pg_catalog.jsonb_build_object('cards', pg_catalog.jsonb_build_array(v_card)), 'p1'
  );
  if pg_catalog.jsonb_array_length(v_player -> 'shield') <> 5
     or pg_catalog.jsonb_array_length(v_player -> 'hand') <> 5
     or pg_catalog.jsonb_array_length(v_player -> 'deck') <> 30 then
    raise exception 'initial deal must be 5 shield, 5 hand, 30 deck';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_player -> 'hand') c where c ->> 'face' <> 'owner_only') then
    raise exception 'initial hand visibility is invalid';
  end if;
  if (select pg_catalog.count(distinct c ->> 'instanceId') from pg_catalog.jsonb_array_elements(
    (v_player -> 'shield') || (v_player -> 'hand') || (v_player -> 'deck')
  ) c) <> 40 then
    raise exception 'instance ids must be unique';
  end if;
end;
$$;

rollback;
