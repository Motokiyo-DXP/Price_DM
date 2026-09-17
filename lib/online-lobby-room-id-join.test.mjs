import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roomsPage = readFileSync(new URL("../app/rooms/page.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/rooms/actions.ts", import.meta.url), "utf8");
const lobbyPage = readFileSync(new URL("../app/rooms/lobbies/[lobbyId]/page.tsx", import.meta.url), "utf8");
const copyButton = readFileSync(new URL("../components/online-lobby-code-copy-button.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260917111928_replace_online_lobby_passphrase_with_room_id_join.sql", import.meta.url), "utf8");

test("private lobby entry uses a room ID only", () => {
  assert.match(roomsPage, /ルームIDで参加/);
  assert.match(roomsPage, /dialog=room-id/);
  assert.doesNotMatch(roomsPage, /PasswordInput|passphrase/);
  assert.match(actions, /joinOnlineLobbyByCodeAction/);
  assert.match(actions, /rpc\("join_online_lobby_by_code", \{ p_join_code: joinCode \}\)/);
  assert.doesNotMatch(actions, /passphrase/);
  assert.doesNotMatch(lobbyPage, /合言葉|setOnlineLobbyPassphraseAction/);
});

test("room-ID join migration validates IDs and preserves member re-entry", () => {
  assert.match(migration, /create function public\.join_online_lobby_by_code\(p_join_code text\)/);
  assert.match(migration, /\^\[A-F0-9\]\{6\}\$/);
  assert.match(migration, /on conflict \(lobby_id, user_id\) do update set last_seen_at = pg_catalog\.now\(\)/);
  assert.match(migration, /drop function if exists public\.set_online_lobby_passphrase/);
  assert.match(migration, /drop function if exists public\.join_online_lobby_with_passphrase/);
});

test("private lobby room ID can be copied without submitting a form", () => {
  assert.match(lobbyPage, /OnlineLobbyCodeCopyButton joinCode=\{lobby\.join_code\}/);
  assert.match(copyButton, /navigator\.clipboard\.writeText\(joinCode\)/);
  assert.match(copyButton, /type="button"/);
  assert.match(copyButton, /aria-label="ルームIDをコピー"/);
});
