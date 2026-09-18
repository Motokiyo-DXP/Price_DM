alter table public.game_rooms
  add column if not exists host_ready boolean not null default false,
  add column if not exists guest_ready boolean not null default false;
