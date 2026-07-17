-- Canonical-card market summaries and detail queries.
-- The default average uses records whose card_print_id is NULL. When none
-- exist, print-specific records remain visible but are explicitly marked as a
-- fallback so that the UI can warn the user instead of hiding the card.

create index if not exists price_records_canonical_shop_observed_idx
  on public.price_records (
    canonical_card_id,
    shop_id,
    observed_on desc,
    created_at desc,
    id desc
  )
  where deleted_at is null;

create or replace view public.canonical_card_market_summary
with (security_invoker = true)
as
with active_records as (
  select records.*
  from public.price_records as records
  where records.deleted_at is null
),
availability as (
  select
    records.canonical_card_id,
    bool_or(records.card_print_id is null) as has_unspecified_records
  from active_records as records
  group by records.canonical_card_id
),
ranked_latest as (
  select
    records.*,
    row_number() over (
      partition by records.canonical_card_id, records.shop_id,
        (records.card_print_id is null)
      order by records.observed_on desc, records.created_at desc, records.id desc
    ) as latest_rank
  from active_records as records
),
selected_latest as (
  select ranked.*
  from ranked_latest as ranked
  join availability
    on availability.canonical_card_id = ranked.canonical_card_id
  where ranked.latest_rank = 1
    and (
      (availability.has_unspecified_records and ranked.card_print_id is null)
      or (not availability.has_unspecified_records)
    )
),
selected_history as (
  select records.*
  from active_records as records
  join availability
    on availability.canonical_card_id = records.canonical_card_id
  where
    (availability.has_unspecified_records and records.card_print_id is null)
    or (not availability.has_unspecified_records)
),
daily_average as (
  select
    records.canonical_card_id,
    records.observed_on,
    round(avg(records.sale_price))::integer as sale_price,
    round(avg(records.buy_price))::integer as buy_price
  from selected_history as records
  group by records.canonical_card_id, records.observed_on
),
ranked_daily_average as (
  select
    daily.*,
    row_number() over (
      partition by daily.canonical_card_id
      order by daily.observed_on desc
    ) as day_rank
  from daily_average as daily
),
trend_values as (
  select
    daily.canonical_card_id,
    max(daily.sale_price) filter (where daily.day_rank = 1) as latest_sale_price,
    max(daily.sale_price) filter (where daily.day_rank = 2) as previous_sale_price,
    max(daily.buy_price) filter (where daily.day_rank = 1) as latest_buy_price,
    max(daily.buy_price) filter (where daily.day_rank = 2) as previous_buy_price
  from ranked_daily_average as daily
  where daily.day_rank <= 2
  group by daily.canonical_card_id
),
current_values as (
  select
    records.canonical_card_id,
    round(avg(records.sale_price))::integer as sale_price,
    round(avg(records.buy_price))::integer as buy_price,
    count(records.sale_price)::integer as sale_record_count,
    count(records.buy_price)::integer as buy_record_count,
    max(records.observed_on) as last_observed_on,
    (array_agg(records.stock_status order by records.observed_on desc,
      records.created_at desc, records.id desc))[1] as stock_status
  from selected_latest as records
  group by records.canonical_card_id
)
select
  canonical.id as canonical_card_id,
  canonical.game_id,
  games.slug as game_slug,
  games.name as game_name,
  canonical.name,
  canonical.name_kana,
  canonical.aliases,
  canonical.aliases_kana,
  coalesce(prints.print_count, 0)::integer as print_count,
  current_values.sale_price,
  current_values.buy_price,
  current_values.sale_record_count,
  current_values.buy_record_count,
  case
    when trends.latest_sale_price is null or trends.previous_sale_price is null
      then 'unknown'
    when trends.latest_sale_price > trends.previous_sale_price then 'up'
    when trends.latest_sale_price < trends.previous_sale_price then 'down'
    else 'same'
  end as sale_trend,
  case
    when trends.latest_buy_price is null or trends.previous_buy_price is null
      then 'unknown'
    when trends.latest_buy_price > trends.previous_buy_price then 'up'
    when trends.latest_buy_price < trends.previous_buy_price then 'down'
    else 'same'
  end as buy_trend,
  current_values.stock_status,
  current_values.last_observed_on,
  coalesce(current_values.last_observed_on < current_date - 30, false) as is_stale,
  not availability.has_unspecified_records as uses_print_fallback
from public.canonical_cards as canonical
join public.tcg_games as games on games.id = canonical.game_id
join availability on availability.canonical_card_id = canonical.id
join current_values on current_values.canonical_card_id = canonical.id
left join trend_values as trends on trends.canonical_card_id = canonical.id
left join lateral (
  select count(*)::integer as print_count
  from public.card_prints as card_prints
  where card_prints.canonical_card_id = canonical.id
    and card_prints.deleted_at is null
) as prints on true
where canonical.deleted_at is null;

comment on view public.canonical_card_market_summary is
  'One row per canonical card with current averages. Unspecified-print records are preferred; uses_print_fallback marks print-specific fallback data.';

create or replace function public.get_canonical_card_price_history(
  p_canonical_card_id bigint,
  p_days integer default 180
)
returns table(
  observed_on date,
  sale_price integer,
  buy_price integer,
  sale_record_count integer,
  buy_record_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    records.observed_on,
    round(avg(records.sale_price))::integer as sale_price,
    round(avg(records.buy_price))::integer as buy_price,
    count(records.sale_price)::integer as sale_record_count,
    count(records.buy_price)::integer as buy_record_count
  from public.price_records as records
  where records.canonical_card_id = p_canonical_card_id
    and records.card_print_id is null
    and records.deleted_at is null
    and records.observed_on >= current_date - least(greatest(coalesce(p_days, 180), 1), 3650)
  group by records.observed_on
  order by records.observed_on;
$$;

create or replace function public.get_canonical_card_best_prices(
  p_canonical_card_id bigint,
  p_exclude_caution_attributes boolean default false
)
returns table(
  price_kind text,
  price integer,
  shop_id bigint,
  shop_name text,
  observed_on date,
  is_stale boolean,
  stock_status public.stock_status,
  card_print_id bigint,
  card_number text,
  product_name text,
  attribute_names text[],
  has_caution_attribute boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with enriched as (
    select
      records.*,
      shops.name as shop_name,
      prints.card_number,
      prints.product_name,
      coalesce(attributes.attribute_names, '{}'::text[]) as attribute_names,
      coalesce(attributes.has_caution_attribute, false) as has_caution_attribute
    from public.price_records as records
    join public.shops as shops on shops.id = records.shop_id
    left join public.card_prints as prints on prints.id = records.card_print_id
    left join lateral (
      select
        array_agg(price_attributes.name order by price_attributes.name) as attribute_names,
        bool_or(price_attributes.slug in (
          'damaged', 'special_price', 'storage', 'special_storage'
        )) as has_caution_attribute
      from public.price_record_attributes as links
      join public.price_attributes as price_attributes
        on price_attributes.id = links.attribute_id
      where links.price_record_id = records.id
        and price_attributes.deleted_at is null
        and price_attributes.approval_status = 'approved'
    ) as attributes on true
    where records.canonical_card_id = p_canonical_card_id
      and records.deleted_at is null
  ),
  ranked_sales as (
    select
      enriched.*,
      row_number() over (
        partition by enriched.shop_id
        order by enriched.observed_on desc, enriched.created_at desc, enriched.id desc
      ) as shop_rank
    from enriched
    where enriched.sale_price is not null
      and (
        not coalesce(p_exclude_caution_attributes, false)
        or not enriched.has_caution_attribute
      )
  ),
  ranked_buys as (
    select
      enriched.*,
      row_number() over (
        partition by enriched.shop_id
        order by enriched.observed_on desc, enriched.created_at desc, enriched.id desc
      ) as shop_rank
    from enriched
    where enriched.buy_price is not null
      and (
        not coalesce(p_exclude_caution_attributes, false)
        or not enriched.has_caution_attribute
      )
  ),
  best_sale as (
    select * from ranked_sales
    where shop_rank = 1
    order by sale_price, observed_on desc, created_at desc
    limit 1
  ),
  best_buy as (
    select * from ranked_buys
    where shop_rank = 1
    order by buy_price desc, observed_on desc, created_at desc
    limit 1
  )
  select
    'sale'::text,
    best_sale.sale_price,
    best_sale.shop_id,
    best_sale.shop_name,
    best_sale.observed_on,
    best_sale.observed_on < current_date - 30,
    best_sale.stock_status,
    best_sale.card_print_id,
    best_sale.card_number,
    best_sale.product_name,
    best_sale.attribute_names,
    best_sale.has_caution_attribute
  from best_sale
  union all
  select
    'buy'::text,
    best_buy.buy_price,
    best_buy.shop_id,
    best_buy.shop_name,
    best_buy.observed_on,
    best_buy.observed_on < current_date - 30,
    best_buy.stock_status,
    best_buy.card_print_id,
    best_buy.card_number,
    best_buy.product_name,
    best_buy.attribute_names,
    best_buy.has_caution_attribute
  from best_buy;
$$;

create or replace function public.get_canonical_card_recent_records(
  p_canonical_card_id bigint,
  p_limit integer default 100
)
returns table(
  price_record_id bigint,
  sale_price integer,
  buy_price integer,
  stock_status public.stock_status,
  observed_on date,
  is_stale boolean,
  shop_name text,
  card_print_id bigint,
  card_number text,
  product_name text,
  attribute_names text[],
  contributor_name text,
  note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    records.id,
    records.sale_price,
    records.buy_price,
    records.stock_status,
    records.observed_on,
    records.observed_on < current_date - 30,
    shops.name,
    records.card_print_id,
    prints.card_number,
    prints.product_name,
    coalesce(attributes.attribute_names, '{}'::text[]),
    records.contributor_name,
    records.note
  from public.price_records as records
  join public.shops as shops on shops.id = records.shop_id
  left join public.card_prints as prints on prints.id = records.card_print_id
  left join lateral (
    select array_agg(price_attributes.name order by price_attributes.name) as attribute_names
    from public.price_record_attributes as links
    join public.price_attributes as price_attributes
      on price_attributes.id = links.attribute_id
    where links.price_record_id = records.id
      and price_attributes.deleted_at is null
      and price_attributes.approval_status = 'approved'
  ) as attributes on true
  where records.canonical_card_id = p_canonical_card_id
    and records.deleted_at is null
  order by records.observed_on desc, records.created_at desc, records.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- Anonymous users only need read access to public data. Registration continues
-- through the PIN-protected function and its dedicated executor role.
drop policy if exists "public read price records" on public.price_records;
create policy "public read price records"
  on public.price_records for select to anon, authenticated
  using (deleted_at is null);

revoke all on public.tcg_games, public.cards, public.canonical_cards,
  public.card_prints, public.card_search_terms, public.shops,
  public.price_records, public.price_attributes,
  public.price_attribute_implications, public.price_record_attributes,
  public.card_market_summary, public.card_price_summary,
  public.canonical_card_market_summary
from anon, authenticated;

grant select on public.tcg_games, public.cards, public.canonical_cards,
  public.card_prints, public.card_search_terms, public.shops,
  public.price_records, public.price_attributes,
  public.price_attribute_implications, public.price_record_attributes,
  public.card_market_summary, public.card_price_summary,
  public.canonical_card_market_summary
to anon, authenticated;

revoke all on function public.get_canonical_card_price_history(bigint, integer),
  public.get_canonical_card_best_prices(bigint, boolean),
  public.get_canonical_card_recent_records(bigint, integer)
from public, anon, authenticated;

grant execute on function public.get_canonical_card_price_history(bigint, integer),
  public.get_canonical_card_best_prices(bigint, boolean),
  public.get_canonical_card_recent_records(bigint, integer)
to anon, authenticated;
