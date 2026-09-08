-- Return only card-level totals, never deck owners or deck contents.
create or replace function private.search_deck_cards_by_usage_impl(
  p_query text default '', p_limit integer default 30, p_ascending boolean default false
)
returns table(id bigint, name text, name_kana text, print_count integer, usage_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return query
  with input as materialized (
    select public.normalize_card_search(coalesce(p_query, '')) as term,
      btrim(coalesce(p_query, '')) as raw
  ), usage as materialized (
    select dc.canonical_card_id, sum(dc.quantity)::bigint as total
    from public.deck_cards dc
    join public.decks d on d.id = dc.deck_id
    group by dc.canonical_card_id
  ), ranked as materialized (
    select c.id, c.name, c.name_kana, coalesce(u.total, 0)::bigint as total
    from public.canonical_cards c
    join public.tcg_games g on g.id = c.game_id
    cross join input i
    left join usage u on u.canonical_card_id = c.id
    where c.deleted_at is null and g.slug = 'duel-masters'
      and (i.term = '' or exists (
        select 1 from public.card_search_terms t
        where t.canonical_card_id = c.id
          and (t.normalized_term like '%' || i.term || '%'
            or extensions.similarity(t.normalized_term, i.term) >= 0.60)
      ) or exists (
        select 1 from public.card_prints p
        where p.canonical_card_id = c.id and p.deleted_at is null
          and (p.card_number ilike '%' || i.raw || '%'
            or p.product_name ilike '%' || i.raw || '%')
      ))
    order by
      case when p_ascending then coalesce(u.total, 0) end asc,
      case when not p_ascending then coalesce(u.total, 0) end desc,
      c.name, c.id
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select r.id, r.name, r.name_kana,
    (select count(*)::integer from public.card_prints p
      where p.canonical_card_id = r.id and p.deleted_at is null),
    r.total
  from ranked r
  order by case when p_ascending then r.total end asc,
    case when not p_ascending then r.total end desc, r.name, r.id;
end;
$$;
revoke all on function private.search_deck_cards_by_usage_impl(text, integer, boolean) from public, anon;
grant execute on function private.search_deck_cards_by_usage_impl(text, integer, boolean) to authenticated;

create or replace function public.search_deck_cards_by_usage(
  p_query text default '', p_limit integer default 30, p_ascending boolean default false
)
returns table(id bigint, name text, name_kana text, print_count integer, usage_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select * from private.search_deck_cards_by_usage_impl(p_query, p_limit, p_ascending);
$$;
revoke all on function public.search_deck_cards_by_usage(text, integer, boolean) from public, anon;
grant execute on function public.search_deck_cards_by_usage(text, integer, boolean) to authenticated;
