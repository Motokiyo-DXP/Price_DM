import assert from "node:assert/strict";
import test from "node:test";
import { formatFriendCode, isUserId, normalizeFriendCode } from "./friend-code.ts";

test("normalizeFriendCode accepts eight digits with or without a display hyphen", () => {
  assert.equal(normalizeFriendCode("00000001"), "00000001");
  assert.equal(normalizeFriendCode("0000-0001"), "00000001");
  assert.equal(normalizeFriendCode(" 0000-0001 "), "00000001");
});

test("normalizeFriendCode rejects malformed codes", () => {
  assert.equal(normalizeFriendCode("1234567"), null);
  assert.equal(normalizeFriendCode("1234-567a"), null);
  assert.equal(normalizeFriendCode(null), null);
});

test("formatFriendCode adds the display separator", () => {
  assert.equal(formatFriendCode("00000000"), "0000-0000");
});

test("isUserId accepts UUIDs and rejects arbitrary form values", () => {
  assert.equal(isUserId("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(isUserId("not-a-user"), false);
});
