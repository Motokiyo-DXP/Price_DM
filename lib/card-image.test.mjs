import assert from "node:assert/strict";
import test from "node:test";
import { getCardImageUrl } from "./card-image.ts";

test("builds a local card image URL", () => {
  assert.equal(getCardImageUrl("prints/123"), "/cards/prints/123.webp");
});

test("encodes path segments and rejects traversal", () => {
  assert.equal(getCardImageUrl("sample/card 1"), "/cards/sample/card%201.webp");
  assert.equal(getCardImageUrl("../secret"), null);
  assert.equal(getCardImageUrl(null), null);
});
