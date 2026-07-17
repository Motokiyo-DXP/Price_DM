create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  registration_pin_hash text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create index if not exists cards_name_trgm_idx on public.cards using gin (name gin_trgm_ops);
create index if not exists cards_name_kana_trgm_idx on public.cards using gin (name_kana gin_trgm_ops);
create index if not exists cards_game_id_idx on public.cards (game_id);
create index if not exists price_records_card_observed_idx on public.price_records (card_id, observed_on desc, created_at desc);
create index if not exists price_records_shop_observed_idx on public.price_records (shop_id, observed_on desc, created_at desc);

-- Public data is readable, but all direct writes remain blocked.
drop policy if exists "public read tcg games" on public.tcg_games;
create policy "public read tcg games" on public.tcg_games for select to anon, authenticated using (true);
drop policy if exists "public read cards" on public.cards;
create policy "public read cards" on public.cards for select to anon, authenticated using (true);
drop policy if exists "public read shops" on public.shops;
create policy "public read shops" on public.shops for select to anon, authenticated using (true);
drop policy if exists "public read price records" on public.price_records;
create policy "public read price records" on public.price_records for select to anon, authenticated using (true);

revoke insert, update, delete on public.tcg_games, public.cards, public.shops, public.price_records from anon, authenticated;
grant select on public.tcg_games, public.cards, public.shops, public.price_records to anon, authenticated;

create or replace function public.search_cards(
  p_query text default '',
  p_game_slug text default null,
  p_limit integer default 30
)
returns table (
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
security invoker
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
    case when c.name = trim(p_query) then 0 when c.name ilike trim(p_query) || '%' then 1 else 2 end,
    similarity(c.name, trim(p_query)) desc,
    c.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function public.search_cards(text,text,integer) to anon, authenticated;

create or replace function public.search_shops(
  p_query text default '',
  p_limit integer default 20
)
returns table (id bigint, name text)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.name
  from public.shops s
  where coalesce(trim(p_query), '') = '' or s.name ilike '%' || trim(p_query) || '%'
  order by case when s.name ilike trim(p_query) || '%' then 0 else 1 end, s.name
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

grant execute on function public.search_shops(text,integer) to anon, authenticated;

create or replace function public.get_card_price_history(
  p_card_id bigint,
  p_days integer default 365
)
returns table (
  record_id bigint,
  observed_on date,
  shop_id bigint,
  shop_name text,
  sale_price integer,
  buy_price integer,
  stock_status public.stock_status,
  contributor_name text,
  note text
)
language sql
stable
security invoker
set search_path = public
as $$
  select pr.id, pr.observed_on, s.id, s.name, pr.sale_price, pr.buy_price,
         pr.stock_status, pr.contributor_name, pr.note
  from public.price_records pr
  join public.shops s on s.id = pr.shop_id
  where pr.card_id = p_card_id
    and pr.observed_on >= current_date - least(greatest(coalesce(p_days, 365), 1), 3650)
  order by pr.observed_on asc, pr.created_at asc;
$$;

grant execute on function public.get_card_price_history(bigint,integer) to anon, authenticated;

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
set search_path = public
as $$
declare
  v_hash text;
  v_shop_id bigint;
  v_record_id bigint;
begin
  select registration_pin_hash into v_hash from public.app_config where id = true;
  if v_hash is null then
    raise exception 'registration_pin_not_configured';
  end if;
  if p_pin is null or crypt(p_pin, v_hash) <> v_hash then
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
    card_id, shop_id, sale_price, buy_price, stock_status,
    observed_on, contributor_name, note
  ) values (
    p_card_id, v_shop_id, p_sale_price, p_buy_price, coalesce(p_stock_status, 'unknown'),
    coalesce(p_observed_on, current_date), nullif(trim(p_contributor_name), ''), nullif(trim(p_note), '')
  ) returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function public.submit_price_record(text,bigint,text,integer,integer,public.stock_status,date,text,text) from public;
grant execute on function public.submit_price_record(text,bigint,text,integer,integer,public.stock_status,date,text,text) to anon, authenticated;

create or replace view public.card_market_summary
with (security_invoker = true)
as
with ranked as (
  select
    pr.*,
    row_number() over (partition by pr.card_id, pr.shop_id order by pr.observed_on desc, pr.created_at desc) as rn,
    lag(pr.sale_price) over (partition by pr.card_id, pr.shop_id order by pr.observed_on, pr.created_at) as previous_sale_price,
    lag(pr.buy_price) over (partition by pr.card_id, pr.shop_id order by pr.observed_on, pr.created_at) as previous_buy_price
  from public.price_records pr
)
select
  c.id as card_id,
  c.game_id,
  c.name,
  c.name_kana,
  c.card_number,
  c.product_name,
  r.sale_price,
  r.buy_price,
  r.previous_sale_price,
  r.previous_buy_price,
  case when r.previous_sale_price is null or r.sale_price is null then 'unknown'
       when r.sale_price > r.previous_sale_price then 'up'
       when r.sale_price < r.previous_sale_price then 'down' else 'flat' end as sale_trend,
  case when r.previous_buy_price is null or r.buy_price is null then 'unknown'
       when r.buy_price > r.previous_buy_price then 'up'
       when r.buy_price < r.previous_buy_price then 'down' else 'flat' end as buy_trend,
  r.stock_status,
  r.observed_on as last_observed_on,
  (r.observed_on < current_date - 30) as is_stale,
  s.id as shop_id,
  s.name as shop_name
from public.cards c
left join ranked r on r.card_id = c.id and r.rn = 1
left join public.shops s on s.id = r.shop_id;

grant select on public.card_market_summary to anon, authenticated;

