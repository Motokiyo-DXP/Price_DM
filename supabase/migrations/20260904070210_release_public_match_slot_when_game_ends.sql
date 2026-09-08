create or replace function private.release_public_match_slot_on_game_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.online_match_slots as slots
  set game_room_id = null,
      updated_at = pg_catalog.now()
  from public.online_lobbies as lobbies
  where slots.game_room_id = new.id
    and lobbies.id = slots.lobby_id
    and lobbies.kind = 'public';

  return new;
end;
$$;

revoke all on function private.release_public_match_slot_on_game_end() from public, anon, authenticated;

drop trigger if exists game_rooms_release_public_match_slot_on_end on public.game_rooms;
create trigger game_rooms_release_public_match_slot_on_end
after update of status on public.game_rooms
for each row
when (
  old.status is distinct from new.status
  and new.status in ('finished', 'cancelled')
)
execute function private.release_public_match_slot_on_game_end();

update public.online_match_slots as slots
set game_room_id = null,
    updated_at = pg_catalog.now()
from public.online_lobbies as lobbies,
     public.game_rooms as rooms
where slots.lobby_id = lobbies.id
  and slots.game_room_id = rooms.id
  and lobbies.kind = 'public'
  and rooms.status in ('finished', 'cancelled');
