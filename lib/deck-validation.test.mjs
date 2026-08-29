import assert from "node:assert/strict";
import test from "node:test";
import { parseDeckInput } from "./deck-validation.ts";

function validForm(cards = [{ canonicalCardId: 1, name: "カード", quantity: 4 }]) {
  const form = new FormData();
  form.set("name", "テストデッキ");
  form.set("format", "original");
  form.set("visibility", "private");
  form.set("description", "説明");
  form.set("cards", JSON.stringify(cards));
  return form;
}

test("accepts a valid draft deck", () => {
  assert.deepEqual(parseDeckInput(validForm()), {
    name: "テストデッキ",
    format: "original",
    visibility: "private",
    description: "説明",
    cards: [{ canonicalCardId: 1, name: "カード", quantity: 4 }],
  });
});

test("rejects duplicate cards and more than forty cards", () => {
  assert.equal(parseDeckInput(validForm([
    { canonicalCardId: 1, name: "A", quantity: 1 },
    { canonicalCardId: 1, name: "A", quantity: 1 },
  ])), null);
  assert.equal(parseDeckInput(validForm(Array.from({ length: 11 }, (_, index) => ({
    canonicalCardId: index + 1,
    name: `card-${index}`,
    quantity: 4,
  })))), null);
});

test("rejects invalid metadata and quantities", () => {
  const invalidFormat = validForm();
  invalidFormat.set("format", "anything");
  assert.equal(parseDeckInput(invalidFormat), null);
  assert.equal(parseDeckInput(validForm([{ canonicalCardId: 1, name: "A", quantity: 5 }])), null);
});
