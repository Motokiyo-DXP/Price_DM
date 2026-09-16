alter table public.decks add column share_token uuid unique;

revoke select on public.decks from anon, authenticated;
grant select (id, owner_id, name, format, visibility, description, created_at, updated_at, folder_id, icon_canonical_card_id, user_sort_order)
  on public.decks to anon, authenticated;

-- Table-level INSERT/UPDATE privileges would let clients write share_token directly.
revoke insert, update on public.decks from authenticated;
grant insert (id, owner_id, name, format, visibility, description, created_at, updated_at, folder_id, icon_canonical_card_id, user_sort_order)
  on public.decks to authenticated;
grant update (owner_id, name, format, visibility, description, created_at, updated_at, folder_id, icon_canonical_card_id, user_sort_order)
  on public.decks to authenticated;

create function public.get_or_create_deck_share_token(p_deck_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if auth.uid() is null then return null; end if;
  update public.decks
    set share_token = coalesce(share_token, pg_catalog.gen_random_uuid())
    where id = p_deck_id and owner_id = auth.uid()
    returning share_token into v_token;
  return v_token;
end;
$$;
revoke all on function public.get_or_create_deck_share_token(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_deck_share_token(uuid) to authenticated;

create function public.get_shared_deck(p_share_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'name', d.name,
    'format', d.format,
    'description', d.description,
    'icon_canonical_card_id', d.icon_canonical_card_id,
    'cards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'canonical_card_id', dc.canonical_card_id,
        'card_print_id', dc.card_print_id,
        'zone', dc.zone,
        'quantity', dc.quantity,
        'sort_order', dc.sort_order,
        'name', cc.name
      ) order by dc.sort_order, dc.id)
      from public.deck_cards dc
      join public.canonical_cards cc on cc.id = dc.canonical_card_id
      where dc.deck_id = d.id
    ), '[]'::jsonb)
  )
  from public.decks d
  where d.share_token = p_share_token;
$$;
revoke all on function public.get_shared_deck(uuid) from public, anon, authenticated;
grant execute on function public.get_shared_deck(uuid) to anon, authenticated;
