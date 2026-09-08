create or replace function public.load_market_cards_with_images(
  p_limit integer default 100
)
returns table(
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
  select
    summary.canonical_card_id,
    summary.game_name,
    summary.name,
    summary.name_kana,
    summary.aliases,
    summary.aliases_kana,
    summary.print_count,
    summary.sale_price,
    summary.buy_price,
    summary.sale_record_count,
    summary.buy_record_count,
    summary.sale_trend,
    summary.buy_trend,
    summary.stock_status,
    summary.last_observed_on,
    summary.is_stale,
    summary.uses_print_fallback,
    image.image_key
  from public.canonical_card_market_summary as summary
  left join lateral (
    select prints.image_key
    from public.card_prints as prints
    where prints.canonical_card_id = summary.canonical_card_id
      and prints.deleted_at is null
      and prints.image_key is not null
    order by prints.id
    limit 1
  ) as image on true
  where summary.last_observed_on is not null
  order by summary.last_observed_on desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

revoke all on function public.load_market_cards_with_images(integer) from public;
grant execute on function public.load_market_cards_with_images(integer) to anon, authenticated;
