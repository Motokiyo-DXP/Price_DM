import assert from "node:assert/strict";
import test from "node:test";
import { expandDeckShareCards, getDeckShareImageLayout, previewArea } from "./deck-share-image-layout.ts";

test("40-60 copies and extra zones fit without overlap or clipping", () => {
  for (const count of [...Array.from({ length: 21 }, (_, i) => i + 40), 72, 100]) {
    const layout = getDeckShareImageLayout(count);
    assert.equal(layout.cells.length, count);
    assert.ok(Math.abs(layout.cardWidth / layout.cardHeight - 5 / 7) < 1e-9);
    for (const [index, cell] of layout.cells.entries()) {
      assert.ok(cell.left >= 0 && cell.top >= 0);
      assert.ok(cell.left + layout.cardWidth <= previewArea.width + 0.001);
      assert.ok(cell.top + layout.cardHeight <= previewArea.height + 0.001);
      for (const other of layout.cells.slice(index + 1)) {
        assert.ok(cell.left + layout.cardWidth <= other.left || other.left + layout.cardWidth <= cell.left
          || cell.top + layout.cardHeight <= other.top || other.top + layout.cardHeight <= cell.top);
      }
    }
  }
  assert.equal(getDeckShareImageLayout(40).columns, 8);
  assert.equal(getDeckShareImageLayout(60).columns, 10);
});

test("every selected print is repeated by quantity in saved order, with extras after main", () => {
  const cards = [
    { zone: "gr", sort_order: 0, quantity: 2, print: 99 },
    { zone: "main", sort_order: 1, quantity: 1, print: 20 },
    { zone: "main", sort_order: 0, quantity: 4, print: 10 },
  ];
  assert.deepEqual(expandDeckShareCards(cards).map(card => card.print), [10, 10, 10, 10, 20, 99, 99]);
  assert.equal(cards[0].zone, "gr");
  assert.equal(getDeckShareImageLayout(0).cells.length, 0);
});
