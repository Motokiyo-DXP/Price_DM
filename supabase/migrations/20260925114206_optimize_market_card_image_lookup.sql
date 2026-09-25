create or replace function public.load_market_cards_with_images(p_limit integer default 100)
returns table (
  canonical_card_id bigint,
  game_name text,
  name text,
  name_kana text,
  aliases text[],
  aliases_kana text[],
  print_count integer,
  sale_price integer,
  buy_price integer,
  sale_record_count integer,
  buy_record_count integer,
  sale_trend text,
  buy_trend text,
  stock_status public.stock_status,
  last_observed_on date,
  is_stale boolean,
  uses_print_fallback boolean,
  image_key text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with market_page as materialized (
    select
      canonical.id as canonical_card_id,
      games.name as game_name,
      canonical.name,
      canonical.name_kana,
      canonical.aliases,
      canonical.aliases_kana,
      coalesce(summary.print_count, 0)::integer as print_count,
      summary.sale_price,
      summary.buy_price,
      coalesce(summary.sale_record_count, 0)::integer as sale_record_count,
      coalesce(summary.buy_record_count, 0)::integer as buy_record_count,
      coalesce(summary.sale_trend, 'unknown') as sale_trend,
      coalesce(summary.buy_trend, 'unknown') as buy_trend,
      summary.stock_status,
      summary.last_observed_on,
      coalesce(summary.is_stale, false) as is_stale,
      coalesce(summary.uses_print_fallback, false) as uses_print_fallback
    from public.canonical_cards as canonical
    join public.tcg_games as games on games.id = canonical.game_id
    left join public.canonical_card_market_summary as summary
      on summary.canonical_card_id = canonical.id
    where canonical.deleted_at is null
    order by summary.last_observed_on desc nulls last, canonical.id
    limit least(greatest(coalesce(p_limit, 100), 1), 1000)
  )
  select
    market_page.canonical_card_id,
    market_page.game_name,
    market_page.name,
    market_page.name_kana,
    market_page.aliases,
    market_page.aliases_kana,
    market_page.print_count,
    market_page.sale_price,
    market_page.buy_price,
    market_page.sale_record_count,
    market_page.buy_record_count,
    market_page.sale_trend,
    market_page.buy_trend,
    market_page.stock_status,
    market_page.last_observed_on,
    market_page.is_stale,
    market_page.uses_print_fallback,
    image.image_key
  from market_page
  left join lateral (
    select prints.image_key
    from public.card_prints as prints
    where prints.canonical_card_id = market_page.canonical_card_id
      and prints.deleted_at is null
      and prints.image_key is not null
    order by prints.id
    limit 1
  ) as image on true
  order by market_page.last_observed_on desc nulls last, market_page.canonical_card_id;
$$;

revoke all on function public.load_market_cards_with_images(integer) from public;
grant execute on function public.load_market_cards_with_images(integer) to anon, authenticated;
