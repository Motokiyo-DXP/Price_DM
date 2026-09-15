alter table public.decks
  add column if not exists user_sort_order integer not null default 0;

alter table public.deck_folders
  add column if not exists user_sort_order integer not null default 0;

alter table public.profiles
  add column if not exists deck_list_sort_mode text not null default 'user'
  check (deck_list_sort_mode = any (array['user'::text, 'popular'::text, 'newest'::text]));

with ranked as (
  select id,
    (row_number() over (
      partition by owner_id, folder_id
      order by updated_at desc, id
    ) - 1)::integer as position
  from public.decks
)
update public.decks as decks
set user_sort_order = ranked.position
from ranked
where ranked.id = decks.id;

with ranked as (
  select id,
    (row_number() over (
      partition by owner_id
      order by created_at, id
    ) - 1)::integer as position
  from public.deck_folders
)
update public.deck_folders as folders
set user_sort_order = ranked.position
from ranked
where ranked.id = folders.id;

create index if not exists decks_owner_folder_user_sort_order_idx
  on public.decks(owner_id, folder_id, user_sort_order, id);

create index if not exists deck_folders_owner_user_sort_order_idx
  on public.deck_folders(owner_id, user_sort_order, id);
