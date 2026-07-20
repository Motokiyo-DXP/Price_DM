import assert from "node:assert/strict";
import test from "node:test";
import { parseCanonicalCardId } from "./card-route-validation.ts";

test("先頭ゼロのない正の安全な10進整数をカードIDとして受け付ける", () => {
  assert.equal(parseCanonicalCardId("1"), 1);
  assert.equal(parseCanonicalCardId("438"), 438);
  assert.equal(
    parseCanonicalCardId(String(Number.MAX_SAFE_INTEGER)),
    Number.MAX_SAFE_INTEGER,
  );
});

test("曖昧な数値表記と不正なカードIDを拒否する", () => {
  for (const value of [
    "",
    "0",
    "01",
    "+1",
    "-1",
    " 1",
    "1 ",
    "1.0",
    "1e2",
    String(Number.MAX_SAFE_INTEGER + 1),
    null,
    undefined,
    1,
  ]) {
    assert.equal(parseCanonicalCardId(value), null);
  }
});
