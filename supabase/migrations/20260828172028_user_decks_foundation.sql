-- User profiles and private deck storage. Gameplay rooms will reference an
-- immutable deck snapshot in a later migration; these tables remain editable.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_display_name_length check (
    char_length(pg_catalog.btrim(display_name)) between 1 and 30
  )
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  format text not null default 'original',
  visibility text not null default 'private',
  description text not null default '',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint decks_name_length check (
    char_length(pg_catalog.btrim(name)) between 1 and 60
  ),
  constraint decks_description_length check (char_length(description) <= 1000),
  constraint decks_format_check check (format in ('original', 'advanced')),
  constraint decks_visibility_check check (
    visibility in ('private', 'unlisted', 'public')
  )
);

create index decks_owner_updated_idx
  on public.decks(owner_id, updated_at desc);
create index decks_public_updated_idx
  on public.decks(updated_at desc)
  where visibility = 'public';

create table public.deck_cards (
  id bigint generated always as identity primary key,
  deck_id uuid not null references public.decks(id) on delete cascade,
  canonical_card_id bigint not null
    references public.canonical_cards(id) on delete restrict,
  card_print_id bigint references public.card_prints(id) on delete restrict,
  zone text not null default 'main',
  quantity smallint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint deck_cards_zone_check check (
    zone in ('main', 'hyperspatial', 'gr', 'outside')
  ),
  constraint deck_cards_quantity_check check (quantity between 1 and 4),
  constraint deck_cards_sort_order_check check (sort_order between 0 and 1000),
  unique nulls not distinct (deck_id, canonical_card_id, card_print_id, zone)
);

create index deck_cards_deck_sort_idx
  on public.deck_cards(deck_id, zone, sort_order, id);
create index deck_cards_canonical_card_idx
  on public.deck_cards(canonical_card_id);
create index deck_cards_card_print_idx
  on public.deck_cards(card_print_id)
  where card_print_id is not null;

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

create policy profiles_public_read
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy profiles_owner_update
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy decks_read_visible_or_owned
  on public.decks for select
  to anon, authenticated
  using (
    visibility = 'public'
    or (select auth.uid()) = owner_id
  );

create policy decks_owner_insert
  on public.decks for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy decks_owner_update
  on public.decks for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy decks_owner_delete
  on public.decks for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy deck_cards_read_visible_or_owned
  on public.deck_cards for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.decks
      where decks.id = deck_cards.deck_id
        and (
          decks.visibility = 'public'
          or decks.owner_id = (select auth.uid())
        )
    )
  );

create policy deck_cards_owner_insert
  on public.deck_cards for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.decks
      where decks.id = deck_cards.deck_id
        and decks.owner_id = (select auth.uid())
    )
  );

create policy deck_cards_owner_update
  on public.deck_cards for update
  to authenticated
  using (
    exists (
      select 1
      from public.decks
      where decks.id = deck_cards.deck_id
        and decks.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.decks
      where decks.id = deck_cards.deck_id
        and decks.owner_id = (select auth.uid())
    )
  );

create policy deck_cards_owner_delete
  on public.deck_cards for delete
  to authenticated
  using (
    exists (
      select 1
      from public.decks
      where decks.id = deck_cards.deck_id
        and decks.owner_id = (select auth.uid())
    )
  );

revoke all on public.profiles, public.decks, public.deck_cards
  from public, anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant select on public.decks, public.deck_cards to anon, authenticated;
grant insert, update, delete on public.profiles, public.decks, public.deck_cards
  to authenticated;
grant usage, select on sequence public.deck_cards_id_seq to authenticated;

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := 'user-' || pg_catalog.left(pg_catalog.replace(new.id::text, '-', ''), 8);
  insert into public.profiles(user_id, display_name)
  values (new.id, v_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public;

create trigger create_profile_after_auth_user
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

insert into public.profiles(user_id, display_name)
select
  users.id,
  'user-' || pg_catalog.left(pg_catalog.replace(users.id::text, '-', ''), 8)
from auth.users as users
on conflict (user_id) do nothing;

comment on table public.decks is
  'Editable user deck metadata. Matches must use a separate immutable snapshot.';
comment on table public.deck_cards is
  'Card quantities in an editable deck; card_print_id is optional until print-specific art is selected.';
