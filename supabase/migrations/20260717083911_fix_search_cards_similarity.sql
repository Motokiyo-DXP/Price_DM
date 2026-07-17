create or replace function public.search_cards(
  p_query text default '',
  p_game_slug text default null,
  p_limit integer default 30
)
returns table(
  id bigint,
  game_slug text,
  game_name text,
  name text,
  name_kana text,
  card_number text,
  product_name text
)
language sql
stable
set search_path = public
as $$
  select c.id, g.slug, g.name, c.name, c.name_kana, c.card_number, c.product_name
  from public.cards c
  join public.tcg_games g on g.id = c.game_id
  where (p_game_slug is null or g.slug = p_game_slug)
    and (
      coalesce(trim(p_query), '') = ''
      or c.name ilike '%' || trim(p_query) || '%'
      or coalesce(c.name_kana, '') ilike '%' || trim(p_query) || '%'
      or coalesce(c.card_number, '') ilike '%' || trim(p_query) || '%'
      or coalesce(c.product_name, '') ilike '%' || trim(p_query) || '%'
    )
  order by
    case
      when c.name = trim(p_query) then 0
      when c.name ilike trim(p_query) || '%' then 1
      else 2
    end,
    extensions.similarity(c.name, trim(p_query)) desc,
    c.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.submit_price_record(
  p_pin text,
  p_card_id bigint,
  p_shop_name text,
  p_sale_price integer default null,
  p_buy_price integer default null,
  p_stock_status public.stock_status default 'unknown',
  p_observed_on date default current_date,
  p_contributor_name text default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_shop_id bigint;
  v_record_id bigint;
begin
  select registration_pin_hash
  into v_hash
  from public.app_config
  where id = true;

  if v_hash is null then
    raise exception 'registration_pin_not_configured';
  end if;

  if p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    raise exception 'invalid_registration_pin';
  end if;

  if not exists (select 1 from public.cards where id = p_card_id) then
    raise exception 'card_not_found';
  end if;

  if coalesce(trim(p_shop_name), '') = '' then
    raise exception 'shop_name_required';
  end if;

  if p_sale_price is null and p_buy_price is null then
    raise exception 'at_least_one_price_required';
  end if;

  if coalesce(p_sale_price, 0) < 0 or coalesce(p_buy_price, 0) < 0 then
    raise exception 'price_must_be_nonnegative';
  end if;

  insert into public.shops(name)
  values (trim(p_shop_name))
  on conflict (name) do update set name = excluded.name
  returning id into v_shop_id;

  insert into public.price_records(
    card_id,
    shop_id,
    sale_price,
    buy_price,
    stock_status,
    observed_on,
    contributor_name,
    note
  )
  values (
    p_card_id,
    v_shop_id,
    p_sale_price,
    p_buy_price,
    coalesce(p_stock_status, 'unknown'),
    coalesce(p_observed_on, current_date),
    nullif(trim(p_contributor_name), ''),
    nullif(trim(p_note), '')
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;
