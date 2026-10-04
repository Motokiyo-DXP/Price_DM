-- Existing decks retain deck_cards.sort_order until a user selects another sort.
alter table public.decks
  add column editor_sort_key text not null default 'saved'
    check (editor_sort_key in ('saved', 'cost', 'added', 'name', 'quantity')),
  add column editor_sort_direction text not null default 'asc'
    check (editor_sort_direction in ('asc', 'desc'));
