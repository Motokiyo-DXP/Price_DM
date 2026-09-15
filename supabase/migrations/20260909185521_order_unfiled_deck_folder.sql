alter table public.profiles
  add column if not exists unfiled_folder_sort_order integer not null default 2147483647;

grant select(unfiled_folder_sort_order)
  on public.profiles to authenticated;

grant update(unfiled_folder_sort_order)
  on public.profiles to authenticated;
