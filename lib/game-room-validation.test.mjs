import assert from "node:assert/strict";
import test from "node:test";
import { gameRoomErrorMessage, normalizeRoomCode, parseDeckId } from "./game-room-validation.ts";

test("room code is normalized to six uppercase hex characters", () => {
  assert.equal(normalizeRoomCode(" a1b2c3 "), "A1B2C3");
  assert.equal(normalizeRoomCode("ABC12Z"), null);
  assert.equal(normalizeRoomCode("12345"), null);
});

test("deck id accepts UUIDs and rejects other values", () => {
  assert.equal(parseDeckId("01234567-89ab-4def-8123-456789abcdef"), "01234567-89ab-4def-8123-456789abcdef");
  assert.equal(parseDeckId("deck-1"), null);
});

test("database errors are converted to useful Japanese feedback", () => {
  assert.match(gameRoomErrorMessage("deck_must_have_40_main_cards"), /40枚/);
  assert.match(gameRoomErrorMessage("deck_format_mismatch"), /フォーマット/);
  assert.match(gameRoomErrorMessage("room_not_available"), /ルーム/);
});
