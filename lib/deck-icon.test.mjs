import assert from "node:assert/strict";
import test from "node:test";
import { getDeckIconSelection } from "./deck-icon.ts";

const cards = [
  { canonical_card_id: 99, card_print_id: 990, zone: "gr" },
  { canonical_card_id: 1, card_print_id: 10, zone: "main" },
  { canonical_card_id: 2, card_print_id: null, zone: "main" },
];

test("falls back to the first main-deck card and keeps its selected print", () => {
  assert.deepEqual(getDeckIconSelection(cards, null), { canonicalCardId: 1, cardPrintId: 10 });
});

test("uses the configured icon and its selected print", () => {
  assert.deepEqual(getDeckIconSelection(cards, 2), { canonicalCardId: 2, cardPrintId: null });
});

test("keeps an icon id that is no longer in the main deck without borrowing a print", () => {
  assert.deepEqual(getDeckIconSelection(cards, 3), { canonicalCardId: 3, cardPrintId: null });
});

test("does not use cards outside the main deck as a fallback", () => {
  assert.equal(getDeckIconSelection(cards.slice(0, 1), null), null);
});
