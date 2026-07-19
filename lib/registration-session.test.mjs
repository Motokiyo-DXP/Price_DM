import assert from "node:assert/strict";
import test from "node:test";
import { isRegistrationSessionToken } from "./registration-session.ts";

test("DBが生成する64文字の16進セッショントークンを受け付ける", () => {
  assert.equal(isRegistrationSessionToken("a1".repeat(32)), true);
  assert.equal(isRegistrationSessionToken("0".repeat(64)), true);
});

test("型、長さ、文字種が異なる値を拒否する", () => {
  for (const token of [
    null,
    undefined,
    123,
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    `${"a".repeat(64)} `,
  ]) {
    assert.equal(isRegistrationSessionToken(token), false, String(token));
  }
});
