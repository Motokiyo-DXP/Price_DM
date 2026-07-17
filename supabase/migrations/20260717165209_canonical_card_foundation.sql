-- Canonical card identity and optional print/version foundation.
-- This migration is additive: legacy public.cards IDs and existing APIs remain
-- available while the application moves to canonical-card based registration.

create table public.canonical_cards (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.tcg_games(id) on delete restrict,
  name text not null,
  name_kana text,
  source_name text not null,
  source_name_kana text,
  aliases text[] not null default '{}'::text[],
  aliases_kana text[] not null default '{}'::text[],
  manually_locked boolean not null default false,
  source_checked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz
);

create unique index canonical_cards_active_name_uidx
  on public.canonical_cards(game_id, name)
  where deleted_at is null;
create index canonical_cards_game_id_idx
  on public.canonical_cards(game_id);
create index canonical_cards_name_trgm_idx
  on public.canonical_cards using gin (name extensions.gin_trgm_ops)
  where deleted_at is null;

create table public.card_prints (
  id bigint generated always as identity primary key,
  canonical_card_id bigint not null
    references public.canonical_cards(id) on delete restrict,
  legacy_card_id bigint unique references public.cards(id) on delete restrict,
  official_card_id text,
  card_number text,
  product_name text,
  official_url text,
  manually_locked boolean not null default false,
  source_checked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz
);

create unique index card_prints_official_card_id_uidx
  on public.card_prints(official_card_id)
  where official_card_id is not null and deleted_at is null;
create index card_prints_canonical_card_id_idx
  on public.card_prints(canonical_card_id)
  where deleted_at is null;
create index card_prints_card_number_trgm_idx
  on public.card_prints using gin (card_number extensions.gin_trgm_ops)
  where card_number is not null and deleted_at is null;

create table public.card_search_terms (
  id bigint generated always as identity primary key,
  canonical_card_id bigint not null
    references public.canonical_cards(id) on delete cascade,
  term text not null,
  normalized_term text not null,
  term_kind text not null check (
    term_kind in ('official_name', 'official_reading', 'alias', 'alias_reading', 'face_name', 'machine_reading')
  ),
  source text not null default 'official',
  verified boolean not null default false,
  priority smallint not null default 100,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique(canonical_card_id, normalized_term, term_kind)
);

create index card_search_terms_card_id_idx
  on public.card_search_terms(canonical_card_id);
create index card_search_terms_normalized_trgm_idx
  on public.card_search_terms using gin (normalized_term extensions.gin_trgm_ops);

-- One canonical row per official card name. Reprints remain separate below.
insert into public.canonical_cards(
  game_id,
  name,
  name_kana,
  source_name,
  source_name_kana,
  source_checked_at
)
select
  cards.game_id,
  cards.name,
  max(nullif(cards.name_kana, '')),
  cards.name,
  max(nullif(cards.name_kana, '')),
  pg_catalog.now()
from public.cards as cards
group by cards.game_id, cards.name;

update public.canonical_cards as canonical
set aliases = coalesce((
      select pg_catalog.array_agg(distinct alias_value order by alias_value)
      from public.cards as cards
      cross join lateral unnest(cards.aliases) as alias_value
      where cards.game_id = canonical.game_id
        and cards.name = canonical.name
        and pg_catalog.btrim(alias_value) <> ''
    ), '{}'::text[]),
    aliases_kana = coalesce((
      select pg_catalog.array_agg(distinct alias_value order by alias_value)
      from public.cards as cards
      cross join lateral unnest(cards.aliases_kana) as alias_value
      where cards.game_id = canonical.game_id
        and cards.name = canonical.name
        and pg_catalog.btrim(alias_value) <> ''
    ), '{}'::text[]),
    updated_at = pg_catalog.now();

insert into public.card_prints(
  canonical_card_id,
  legacy_card_id,
  official_card_id,
  card_number,
  product_name,
  official_url,
  source_checked_at
)
select
  canonical.id,
  cards.id,
  nullif(substring(cards.official_url from '[?&]id=([^&]+)'), ''),
  cards.card_number,
  cards.product_name,
  cards.official_url,
  pg_catalog.now()
from public.cards as cards
join public.canonical_cards as canonical
  on canonical.game_id = cards.game_id
 and canonical.name = cards.name
 and canonical.deleted_at is null;

insert into public.card_search_terms(
  canonical_card_id,
  term,
  normalized_term,
  term_kind,
  source,
  verified,
  priority
)
select
  canonical.id,
  terms.term,
  public.normalize_card_search(terms.term),
  terms.term_kind,
  terms.source,
  terms.verified,
  terms.priority
from public.canonical_cards as canonical
cross join lateral (
  values
    (canonical.name, 'official_name', 'official', true, 0),
    (canonical.name_kana, 'official_reading', 'official', true, 10)
) as terms(term, term_kind, source, verified, priority)
where terms.term is not null
  and public.normalize_card_search(terms.term) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do nothing;

insert into public.card_search_terms(
  canonical_card_id,
  term,
  normalized_term,
  term_kind,
  source,
  verified,
  priority
)
select
  canonical.id,
  alias_value,
  public.normalize_card_search(alias_value),
  'alias',
  'legacy-backfill',
  true,
  20
from public.canonical_cards as canonical
cross join lateral unnest(canonical.aliases) as alias_value
where public.normalize_card_search(alias_value) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do nothing;

insert into public.card_search_terms(
  canonical_card_id,
  term,
  normalized_term,
  term_kind,
  source,
  verified,
  priority
)
select
  canonical.id,
  alias_value,
  public.normalize_card_search(alias_value),
  'alias_reading',
  'legacy-backfill',
  true,
  30
from public.canonical_cards as canonical
cross join lateral unnest(canonical.aliases_kana) as alias_value
where public.normalize_card_search(alias_value) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do nothing;

alter table public.price_records
  add column canonical_card_id bigint,
  add column card_print_id bigint,
  add column updated_at timestamptz not null default pg_catalog.now(),
  add column deleted_at timestamptz;

update public.price_records as records
set canonical_card_id = prints.canonical_card_id,
    card_print_id = prints.id
from public.card_prints as prints
where prints.legacy_card_id = records.card_id;

do $$
begin
  if exists (
    select 1 from public.price_records where canonical_card_id is null
  ) then
    raise exception 'canonical card backfill failed';
  end if;
end;
$$;

alter table public.price_records
  alter column canonical_card_id set not null,
  alter column card_id drop not null,
  add constraint price_records_canonical_card_id_fkey
    foreign key (canonical_card_id)
    references public.canonical_cards(id) on delete restrict,
  add constraint price_records_card_print_id_fkey
    foreign key (card_print_id)
    references public.card_prints(id) on delete restrict;

create index price_records_canonical_observed_idx
  on public.price_records(canonical_card_id, observed_on desc, created_at desc)
  where deleted_at is null;
create index price_records_print_observed_idx
  on public.price_records(card_print_id, observed_on desc, created_at desc)
  where card_print_id is not null and deleted_at is null;

create table public.price_attributes (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  is_builtin boolean not null default false,
  approval_status text not null default 'approved' check (
    approval_status in ('approved', 'pending', 'rejected', 'merged')
  ),
  merged_into_id bigint references public.price_attributes(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz
);

create table public.price_attribute_implications (
  attribute_id bigint not null references public.price_attributes(id) on delete cascade,
  implied_attribute_id bigint not null references public.price_attributes(id) on delete cascade,
  primary key(attribute_id, implied_attribute_id),
  check (attribute_id <> implied_attribute_id)
);

create table public.price_record_attributes (
  price_record_id bigint not null references public.price_records(id) on delete cascade,
  attribute_id bigint not null references public.price_attributes(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key(price_record_id, attribute_id)
);

create index price_attribute_implications_implied_idx
  on public.price_attribute_implications(implied_attribute_id);
create index price_record_attributes_attribute_idx
  on public.price_record_attributes(attribute_id, price_record_id);

insert into public.price_attributes(slug, name, is_builtin)
values
  ('normal', '通常価格', true),
  ('damaged', '傷あり', true),
  ('special_price', '特価', true),
  ('storage', 'ストレージ', true),
  ('special_storage', '特価ストレージ', true)
on conflict (slug) do update
set name = excluded.name,
    is_builtin = true,
    updated_at = pg_catalog.now();

insert into public.price_attribute_implications(attribute_id, implied_attribute_id)
select special_storage.id, implied.id
from public.price_attributes as special_storage
join public.price_attributes as implied
  on implied.slug in ('special_price', 'storage')
where special_storage.slug = 'special_storage'
on conflict do nothing;

alter table public.canonical_cards enable row level security;
alter table public.card_prints enable row level security;
alter table public.card_search_terms enable row level security;
alter table public.price_attributes enable row level security;
alter table public.price_attribute_implications enable row level security;
alter table public.price_record_attributes enable row level security;

create policy canonical_cards_public_read
  on public.canonical_cards for select to anon, authenticated
  using (deleted_at is null);
create policy card_prints_public_read
  on public.card_prints for select to anon, authenticated
  using (deleted_at is null);
create policy card_search_terms_public_read
  on public.card_search_terms for select to anon, authenticated
  using (true);
create policy price_attributes_public_read
  on public.price_attributes for select to anon, authenticated
  using (deleted_at is null and approval_status = 'approved');
create policy price_attribute_implications_public_read
  on public.price_attribute_implications for select to anon, authenticated
  using (true);
create policy price_record_attributes_public_read
  on public.price_record_attributes for select to anon, authenticated
  using (true);

revoke all on public.canonical_cards,
  public.card_prints,
  public.card_search_terms,
  public.price_attributes,
  public.price_attribute_implications,
  public.price_record_attributes
from public, anon, authenticated;

grant select on public.canonical_cards,
  public.card_prints,
  public.card_search_terms,
  public.price_attributes,
  public.price_attribute_implications,
  public.price_record_attributes
to anon, authenticated;

comment on column public.price_records.card_print_id is
  'NULL means the contributor did not specify a print/version.';
comment on table public.canonical_cards is
  'One row per card name used as the default market-analysis unit.';
comment on table public.card_prints is
  'Official print/version records linked to a canonical card.';

