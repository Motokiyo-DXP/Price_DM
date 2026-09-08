create or replace function private.build_game_deck_snapshot(p_deck_id uuid, p_owner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
  select pg_catalog.coalesce(pg_catalog.sum(quantity), 0)::integer into v_main_count
  from public.deck_cards where deck_id = p_deck_id and zone = 'main';
  if v_main_count <> v_required_count then raise exception 'deck_has_invalid_main_count' using errcode = '23514'; end if;
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
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
    select cp.id, cp.image_key from public.card_prints cp
    where cp.canonical_card_id = dc.canonical_card_id and cp.deleted_at is null
    order by (cp.id = dc.card_print_id) desc, (cp.image_key is not null) desc, cp.id limit 1
  ) artwork on true where dc.deck_id = p_deck_id;
  return pg_catalog.jsonb_build_object('sourceDeckId', v_deck.id, 'name', v_deck.name, 'format', v_deck.format, 'capturedAt', pg_catalog.now(), 'cards', v_cards);
end;
$$;

revoke all on function private.build_game_deck_snapshot(uuid, uuid) from public;
