create table private.price_record_update_events (
  id bigint generated always as identity primary key,
  price_record_id bigint not null references public.price_records(id) on delete cascade,
  contributor_user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now()
);

alter table private.price_record_update_events enable row level security;
revoke all on table private.price_record_update_events from public, anon, authenticated;

create index price_record_update_events_user_updated_idx
  on private.price_record_update_events (contributor_user_id, updated_at desc);

create or replace function private.capture_price_record_update_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is not null
    and (tg_op = 'INSERT' or new.updated_at is distinct from old.updated_at)
  then
    insert into private.price_record_update_events (
      price_record_id, contributor_user_id, updated_at
    ) values (
      new.id, v_user_id, new.updated_at
    );
  end if;
  return new;
end;
$$;

revoke all on function private.capture_price_record_update_event() from public, anon, authenticated;

create trigger capture_price_record_update_event
  after insert or update on public.price_records
  for each row execute function private.capture_price_record_update_event();

create or replace function public.load_market_card_sort_metadata(p_card_ids bigint[])
returns table (
  canonical_card_id bigint,
  all_accounts_updated_at timestamptz,
  own_account_updated_at timestamptz,
  latest_release_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested.canonical_card_id,
    (select max(records.updated_at)
     from public.price_records as records
     where records.canonical_card_id = requested.canonical_card_id
       and records.deleted_at is null) as all_accounts_updated_at,
    (select max(events.updated_at)
     from private.price_record_update_events as events
     join public.price_records as records on records.id = events.price_record_id
     where records.canonical_card_id = requested.canonical_card_id
       and records.deleted_at is null
       and events.contributor_user_id = (select auth.uid())) as own_account_updated_at,
    (select max(products.release_date)
     from public.card_prints as prints
     join public.card_products as products on products.id = prints.product_id
     where prints.canonical_card_id = requested.canonical_card_id
       and prints.deleted_at is null) as latest_release_date
  from (
    select distinct card_id as canonical_card_id
    from pg_catalog.unnest(coalesce(p_card_ids, '{}'::bigint[])) as ids(card_id)
    where card_id > 0
    limit 1000
  ) as requested
  ;
$$;

revoke all on function public.load_market_card_sort_metadata(bigint[]) from public;
grant execute on function public.load_market_card_sort_metadata(bigint[]) to anon, authenticated;

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
  select
    canonical.id,
    games.name,
    canonical.name,
    canonical.name_kana,
    canonical.aliases,
    canonical.aliases_kana,
    coalesce(summary.print_count, 0)::integer,
    summary.sale_price,
    summary.buy_price,
    coalesce(summary.sale_record_count, 0)::integer,
    coalesce(summary.buy_record_count, 0)::integer,
    coalesce(summary.sale_trend, 'unknown'),
    coalesce(summary.buy_trend, 'unknown'),
    summary.stock_status,
    summary.last_observed_on,
    coalesce(summary.is_stale, false),
    coalesce(summary.uses_print_fallback, false),
    image.image_key
  from public.canonical_cards as canonical
  join public.tcg_games as games on games.id = canonical.game_id
  left join public.canonical_card_market_summary as summary
    on summary.canonical_card_id = canonical.id
  left join lateral (
    select prints.image_key
    from public.card_prints as prints
    where prints.canonical_card_id = canonical.id
      and prints.deleted_at is null
      and prints.image_key is not null
    order by prints.id
    limit 1
  ) as image on true
  where canonical.deleted_at is null
  order by summary.last_observed_on desc nulls last, canonical.id
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

revoke all on function public.load_market_cards_with_images(integer) from public;
grant execute on function public.load_market_cards_with_images(integer) to anon, authenticated;
