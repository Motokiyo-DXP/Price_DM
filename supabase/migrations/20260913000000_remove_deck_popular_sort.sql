update public.profiles
set deck_list_sort_mode = 'user'
where deck_list_sort_mode = 'popular';

alter table public.profiles
  drop constraint if exists profiles_deck_list_sort_mode_check;

alter table public.profiles
  add constraint profiles_deck_list_sort_mode_check
  check (deck_list_sort_mode = any (array['user'::text, 'newest'::text]));
