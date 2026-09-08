import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260904072026_filter_inactive_online_lobby_members.sql", import.meta.url), "utf8");

test("ルームメンバーは閲覧中または同じロビーで対戦中の利用者だけを返す", () => {
  assert.match(migration, /members\.last_seen_at >= pg_catalog\.now\(\) - interval '30 seconds'/);
  assert.match(migration, /slots\.lobby_id = p_lobby_id/);
  assert.match(migration, /rooms\.status = 'playing'/);
  assert.match(migration, /rooms\.host_user_id = members\.user_id/);
  assert.match(migration, /rooms\.guest_user_id = members\.user_id/);
  assert.match(migration, /spectators\.user_id = members\.user_id/);
});
