create index if not exists price_records_card_observed_idx
  on public.price_records (card_id, observed_on desc, created_at desc);

create index if not exists price_records_shop_observed_idx
  on public.price_records (shop_id, observed_on desc, created_at desc);

create or replace view public.card_price_summary
with (security_invoker = true)
as
with ranked as (
  select
    pr.*,
    row_number() over (
      partition by pr.card_id
      order by pr.observed_on desc, pr.created_at desc, pr.id desc
    ) as rn,
    lag(pr.sale_price) over (
      partition by pr.card_id
      order by pr.observed_on, pr.created_at, pr.id
    ) as previous_sale_price,
    lag(pr.buy_price) over (
      partition by pr.card_id
      order by pr.observed_on, pr.created_at, pr.id
    ) as previous_buy_price
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
  case
    when r.sale_price is null or r.previous_sale_price is null then 'unknown'
    when r.sale_price > r.previous_sale_price then 'up'
    when r.sale_price < r.previous_sale_price then 'down'
    else 'same'
  end as sale_trend,
  case
    when r.buy_price is null or r.previous_buy_price is null then 'unknown'
    when r.buy_price > r.previous_buy_price then 'up'
    when r.buy_price < r.previous_buy_price then 'down'
    else 'same'
  end as buy_trend,
  r.stock_status,
  r.observed_on as last_observed_on,
  (r.observed_on < current_date - 30) as is_stale,
  r.shop_id,
  s.name as shop_name
from public.cards c
left join ranked r on r.card_id = c.id and r.rn = 1
left join public.shops s on s.id = r.shop_id;

grant select on public.card_price_summary to anon, authenticated;
