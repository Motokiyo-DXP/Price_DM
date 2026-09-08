-- Do not let a burst of stale or concurrent board writes occupy every
-- PostgREST database connection while waiting for the same room row.
alter function private.update_game_room_state_secure_impl(uuid, bigint, jsonb)
  set lock_timeout = '250ms';
