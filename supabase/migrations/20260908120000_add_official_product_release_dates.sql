create table public.card_products (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.tcg_games(id) on delete restrict,
  product_code text not null,
  product_name text not null,
  release_date date,
  release_date_precision text not null default 'day'
    check (release_date_precision in ('day', 'month', 'year', 'unknown')),
  official_url text,
  source_checked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (game_id, product_code)
);

alter table public.card_prints
  add column product_id bigint references public.card_products(id) on delete restrict;

create index card_prints_product_id_idx on public.card_prints(product_id)
  where product_id is not null and deleted_at is null;

alter table public.card_products enable row level security;
create policy card_products_public_read on public.card_products
  for select to anon, authenticated using (true);
grant select on public.card_products to anon, authenticated;

comment on table public.card_products is
  'Official TCG products shared by card printings; release dates are sourced from official product pages.';
comment on column public.card_products.release_date_precision is
  'Precision of the official release date. Unknown or non-single-date distributions remain nullable.';
