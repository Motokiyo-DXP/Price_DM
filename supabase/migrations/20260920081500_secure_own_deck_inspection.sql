create or replace function public.inspect_own_game_deck(p_room_id uuid, p_count integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_state jsonb;
  v_player text;
  v_deck jsonb;
begin
  if p_count is not null and p_count < 1 then
    raise exception 'invalid_inspection_count' using errcode = '22023';
  end if;

  select rooms.state,
    case when rooms.host_user_id = v_user_id then 'p1' else 'p2' end
  into v_state, v_player
  from public.game_rooms as rooms
  where rooms.id = p_room_id
    and rooms.status = 'playing'
    and v_user_id is not null
    and (rooms.host_user_id = v_user_id or rooms.guest_user_id = v_user_id);

  if not found then
    raise exception 'room_access_denied' using errcode = '42501';
  end if;

  v_deck := coalesce(v_state #> array['players', v_player, 'deck'], '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_deck) <> 'array' then
    raise exception 'invalid_game_zone' using errcode = '22023';
  end if;

  if p_count is null then
    return v_deck;
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(card.value order by card.ordinal)
    from pg_catalog.jsonb_array_elements(v_deck) with ordinality as card(value, ordinal)
    where card.ordinal <= p_count
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.inspect_own_game_deck(uuid, integer) from public, anon;
grant execute on function public.inspect_own_game_deck(uuid, integer) to authenticated;
