create extension if not exists pg_trgm;

create table public.tcg_games (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.cards (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.tcg_games(id) on delete restrict,
  name text not null,
  name_kana text,
  card_number text,
  product_name text,
  official_url text,
  created_at timestamptz not null default now(),
  unique (game_id, name, card_number)
);

create table public.shops (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create type public.stock_status as enum (
  'in_stock',
  'low_stock',
  'out_of_stock',
  'unknown',
  'buying',
  'buying_paused'
);

create table public.price_records (
  id bigint generated always as identity primary key,
  card_id bigint not null references public.cards(id) on delete restrict,
  shop_id bigint not null references public.shops(id) on delete restrict,
  sale_price integer check (sale_price is null or sale_price >= 0),
  buy_price integer check (buy_price is null or buy_price >= 0),
  stock_status public.stock_status not null default 'unknown',
  observed_on date not null default current_date,
  contributor_name text,
  note text,
  created_at timestamptz not null default now(),
  check (sale_price is not null or buy_price is not null)
);

create index cards_name_trgm_idx on public.cards using gin (name gin_trgm_ops);
create index cards_name_kana_trgm_idx on public.cards using gin (name_kana gin_trgm_ops);
create index cards_game_id_idx on public.cards(game_id);
create index price_records_card_date_idx on public.price_records(card_id, observed_on desc);
create index price_records_shop_date_idx on public.price_records(shop_id, observed_on desc);

alter table public.tcg_games enable row level security;
alter table public.cards enable row level security;
alter table public.shops enable row level security;
alter table public.price_records enable row level security;

create policy "public read tcg games" on public.tcg_games for select to anon, authenticated using (true);
create policy "public read cards" on public.cards for select to anon, authenticated using (true);
create policy "public read shops" on public.shops for select to anon, authenticated using (true);
create policy "public read price records" on public.price_records for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.tcg_games, public.cards, public.shops, public.price_records to anon, authenticated;

insert into public.tcg_games (slug, name) values
  ('duel-masters', 'デュエル・マスターズ'),
  ('pokemon-card', 'ポケモンカードゲーム'),
  ('one-piece-card', 'ONE PIECEカードゲーム'),
  ('magic-the-gathering', 'Magic: The Gathering');
