import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260917094741_enforce_single_active_online_match_participation.sql", import.meta.url), "utf8");
const e2e = readFileSync(new URL("../supabase/tests/online_match_single_participation_e2e.sql", import.meta.url), "utf8");

test("online match entry serializes one account and clears old active participation before joining", () => {
  assert.match(migration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(v_user_id::text, 0\)\)/);
  assert.match(migration, /rooms\.status in \('waiting', 'ready', 'playing'\)/);
  assert.match(migration, /slots\.id <> p_slot_id/);
  assert.match(migration, /perform private\.leave_online_match_room\(v_locked_room\.id, v_user_id\)/);
  assert.match(migration, /order by slots\.id\s+for update of slots/);
  assert.match(migration, /order by rooms\.id\s+for update of rooms/);
});

test("old online room cleanup distinguishes spectator, waiting player, host, and playing disconnect", () => {
  assert.match(migration, /delete from public\.game_room_spectators[\s\S]*?delete from public\.game_room_presence/);
  assert.match(migration, /guest_user_id = null,[\s\S]*?guest_deck_snapshot = null,[\s\S]*?guest_ready = false/);
  assert.match(migration, /set status = 'cancelled'/);
  assert.match(migration, /winner_user_id = v_room\.guest_user_id,[\s\S]*?end_reason = 'disconnect'/);
  assert.match(migration, /winner_user_id = v_room\.host_user_id,[\s\S]*?end_reason = 'disconnect'/);
});

test("same-slot re-entry and the database E2E cover the required movement cases", () => {
  assert.match(migration, /v_target_room\.host_user_id = v_user_id/);
  assert.match(migration, /v_target_room\.guest_user_id = v_user_id/);
  assert.match(migration, /p_role = 'spectator' and exists/);
  assert.match(migration, /delete from public\.game_room_spectators[\s\S]*?where room_id = v_target_room\.id and user_id = v_user_id/);
  for (const scenario of [
    "player_to_player", "player_to_spectator", "spectator_to_player",
    "same_slot_reentry", "playing_disconnect", "public_slot_release",
    "unrelated_user_unchanged", "single_active_participation", "history_retained", "concurrent_requests",
  ]) assert.match(e2e, new RegExp(`-- ${scenario}`));
});
