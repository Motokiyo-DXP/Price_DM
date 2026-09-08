create table public.account_card_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_card_id bigint not null references public.canonical_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, canonical_card_id)
);

comment on table public.account_card_bookmarks is
  'Canonical cards saved to each authenticated account shopping list.';

create index account_card_bookmarks_user_created_idx
  on public.account_card_bookmarks (user_id, created_at desc);

alter table public.account_card_bookmarks enable row level security;

create policy account_card_bookmarks_select_own
  on public.account_card_bookmarks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy account_card_bookmarks_insert_own
  on public.account_card_bookmarks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy account_card_bookmarks_delete_own
  on public.account_card_bookmarks for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.account_card_bookmarks from anon, authenticated;
grant select, insert, delete on table public.account_card_bookmarks to authenticated;
