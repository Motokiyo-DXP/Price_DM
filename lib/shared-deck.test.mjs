import assert from "node:assert/strict";
import test from "node:test";
import { isUuid, parseSharedDeck } from "./shared-deck.ts";

test("共有キーは正しい UUID だけを受け付ける", () => {
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000/other"), false);
  assert.equal(isUuid("not-a-token"), false);
});

test("共有デッキは複製に必要なカード情報を検証する", () => {
  const deck = {
    name: "共有デッキ", format: "original", description: "", icon_canonical_card_id: null,
    cards: [{ canonical_card_id: 1, card_print_id: null, zone: "main", quantity: 4, sort_order: 0, name: "カード" }],
  };
  assert.deepEqual(parseSharedDeck(deck), deck);
  assert.equal(parseSharedDeck({ ...deck, cards: [{ ...deck.cards[0], quantity: "4" }] }), null);
  assert.equal(parseSharedDeck({ ...deck, cards: "invalid" }), null);
});
