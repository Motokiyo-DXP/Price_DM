-- Search-result sorting for the deck editor. This keeps the existing search
-- match calculation intact and orders the complete matched set before LIMIT.
create or replace function private.search_deck_cards_filtered_impl(
  p_query text default '', p_limit integer default 30,
  p_sort text default 'usage', p_ascending boolean default false,
  p_product_name text default null, p_card_number text default null,
  p_civilizations text[] default '{}'::text[], p_civilization_mode text default 'cup',
  p_color text default 'all', p_card_types text[] default '{}'::text[],
  p_min_cost integer default null, p_max_cost integer default null,
  p_no_cost boolean default false, p_image text default 'all'
)
returns table(id bigint, name text, name_kana text, print_count integer, usage_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return query
  with search_input as materialized (
    select public.normalize_card_search(coalesce(p_query, '')) as term,
      pg_catalog.btrim(coalesce(p_query, '')) as raw
  ), term_matches as materialized (
    select t.canonical_card_id,
      max(extensions.similarity(t.normalized_term, i.term)) as score,
      bool_or(t.normalized_term = i.term) as exact,
      bool_or(t.normalized_term like i.term || '%') as prefix,
      bool_or(t.normalized_term like '%' || i.term || '%') as contains
    from public.card_search_terms t cross join search_input i
    where i.term <> '' and (
      t.normalized_term = i.term
      or t.normalized_term like i.term || '%'
      or t.normalized_term like '%' || i.term || '%'
      or (t.normalized_term operator(extensions.%) i.term
        and extensions.similarity(t.normalized_term, i.term) >= 0.60)
    )
    group by t.canonical_card_id
  ), usage as materialized (
    select dc.canonical_card_id, sum(dc.quantity)::bigint as total
    from public.deck_cards dc join public.decks d on d.id = dc.deck_id
    group by dc.canonical_card_id
  ), release_dates as materialized (
    select p.canonical_card_id, min(products.release_date) as first_release_date
    from public.card_prints p
    join public.card_products products on products.id = p.product_id
    where p.deleted_at is null and products.release_date is not null
    group by p.canonical_card_id
  ), matched as (
    select c.id, c.name, c.name_kana, coalesce(u.total, 0)::bigint as total,
      i.term = '' as empty_query,
      coalesce(tm.exact, false) as exact,
      coalesce(tm.prefix, false) as prefix,
      coalesce(tm.contains, false) as contains,
      coalesce(tm.score, 0::real) as score,
      rd.first_release_date,
      (select count(*)::integer from public.card_prints p
        where p.canonical_card_id = c.id and p.deleted_at is null) as prints
    from public.canonical_cards c
    join public.tcg_games g on g.id = c.game_id and g.slug = 'duel-masters'
    cross join search_input i
    left join term_matches tm on tm.canonical_card_id = c.id
    left join usage u on u.canonical_card_id = c.id
    left join release_dates rd on rd.canonical_card_id = c.id
    where c.deleted_at is null
      and (i.term = '' or tm.canonical_card_id is not null or exists (
        select 1 from public.card_prints p
        where p.canonical_card_id = c.id and p.deleted_at is null
          and (p.card_number ilike '%' || i.raw || '%'
            or p.product_name ilike '%' || i.raw || '%')
      ))
      and (nullif(p_product_name, '') is null or exists (
        select 1 from public.card_prints p
        where p.canonical_card_id = c.id and p.deleted_at is null
          and p.product_name = p_product_name
      ))
      and (nullif(pg_catalog.btrim(p_card_number), '') is null or exists (
        select 1 from public.card_prints p
        where p.canonical_card_id = c.id and p.deleted_at is null
          and p.card_number ilike '%' || pg_catalog.btrim(p_card_number) || '%'
      ))
      and (cardinality(p_civilizations) = 0
        or (p_civilization_mode = 'cap' and c.civilizations @> p_civilizations)
        or (p_civilization_mode <> 'cap' and c.civilizations && p_civilizations))
      and (p_color = 'all'
        or (p_color = 'single' and cardinality(c.civilizations) = 1)
        or (p_color = 'multi' and cardinality(c.civilizations) > 1))
      and (cardinality(p_card_types) = 0 or c.card_types && p_card_types)
      and (
        (p_min_cost is null and p_max_cost is null)
        or (c.cost is null and p_no_cost)
        or ((p_min_cost is not null or p_max_cost is not null)
          and c.cost is not null
          and (p_min_cost is null or c.cost >= p_min_cost)
          and (p_max_cost is null or c.cost <= p_max_cost))
      )
      and (p_image = 'all'
        or (p_image = 'with' and exists (
          select 1 from public.card_prints p
          where p.canonical_card_id = c.id and p.deleted_at is null and p.image_key is not null))
        or (p_image = 'without' and not exists (
          select 1 from public.card_prints p
          where p.canonical_card_id = c.id and p.deleted_at is null and p.image_key is not null)))
  )
  select m.id, m.name, m.name_kana, m.prints, m.total
  from matched m
  order by
    case when p_sort = 'relevance' and m.empty_query then m.total end desc,
    case when p_sort = 'relevance' and m.empty_query then m.name end asc,
    case when p_sort = 'relevance' and not m.empty_query and p_ascending then m.exact end desc,
    case when p_sort = 'relevance' and not m.empty_query and p_ascending then m.prefix end desc,
    case when p_sort = 'relevance' and not m.empty_query and p_ascending then m.contains end desc,
    case when p_sort = 'relevance' and not m.empty_query and p_ascending then m.score end desc,
    case when p_sort = 'relevance' and not m.empty_query and not p_ascending then m.exact end asc,
    case when p_sort = 'relevance' and not m.empty_query and not p_ascending then m.prefix end asc,
    case when p_sort = 'relevance' and not m.empty_query and not p_ascending then m.contains end asc,
    case when p_sort = 'relevance' and not m.empty_query and not p_ascending then m.score end asc,
    case when p_sort = 'name' and p_ascending then m.name end asc,
    case when p_sort = 'name' and not p_ascending then m.name end desc,
    case when p_sort = 'release_date' then m.first_release_date is null end asc,
    case when p_sort = 'release_date' and p_ascending then m.first_release_date end asc,
    case when p_sort = 'release_date' and not p_ascending then m.first_release_date end desc,
    case when p_sort = 'usage' and p_ascending then m.total end asc,
    case when p_sort = 'usage' and not p_ascending then m.total end desc,
    case when p_sort = 'relevance' and not m.empty_query and p_ascending then m.name end asc,
    case when p_sort = 'relevance' and not m.empty_query and p_ascending then m.id end asc,
    case when p_sort = 'relevance' and not m.empty_query and not p_ascending then m.name end desc,
    case when p_sort = 'relevance' and not m.empty_query and not p_ascending then m.id end desc,
    case when p_sort <> 'relevance' then m.name end asc,
    case when p_sort <> 'relevance' then m.id end asc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function private.search_deck_cards_filtered_impl(
  text,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
) from public, anon;
grant execute on function private.search_deck_cards_filtered_impl(
  text,integer,text,boolean,text,text,text[],text,text,text[],integer,integer,boolean,text
) to authenticated;
