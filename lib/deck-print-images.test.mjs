import assert from "node:assert/strict";
import test from "node:test";
import { loadDeckCardPrints } from "./deck-print-images.ts";

function client(rows, failOffset = -1) {
  const ranges = [];
  const query = {
    select() { return this; }, in() { return this; }, not() { return this; },
    order(column) { assert.equal(column, "id"); return this; },
    async range(start, end) {
      ranges.push([start, end]);
      return start === failOffset ? { data: null, error: { message: "failure" } }
        : { data: rows.slice(start, end + 1), error: null };
    },
  };
  return { from(table) { assert.equal(table, "card_prints"); return query; }, ranges };
}

test("includes selected artwork beyond the API's first 1000 rows", async () => {
  const rows = Array.from({ length: 1049 }, (_, id) => ({ id, image_key: `official/${id}` }));
  rows[1002] = { id: 48175, image_key: "official/dm26rp3-preview-044" };
  rows[1039] = { id: 48476, image_key: "official/dm26ex4-preview-079-48c5f275afdc90d8" };
  const db = client(rows);
  assert.deepEqual(await loadDeckCardPrints(db, [43741, 44012]), rows);
  assert.deepEqual(db.ranges, [[0, 499], [500, 999], [1000, 1499]]);
});

test("keeps small results and missing images unchanged, skips empty selections", async () => {
  for (const rows of [[], [{ id: 11011, image_key: "official/dmrp15-028" }]]) {
    assert.deepEqual(await loadDeckCardPrints(client(rows), [1269]), rows);
  }
  const db = client([]);
  assert.deepEqual(await loadDeckCardPrints(db, []), []);
  assert.deepEqual(db.ranges, []);
});

test("handles exact page boundaries and rejects partial results on query failure", async () => {
  const rows = Array.from({ length: 500 }, (_, id) => ({ id }));
  const db = client(rows);
  assert.deepEqual(await loadDeckCardPrints(db, [1]), rows);
  assert.deepEqual(db.ranges, [[0, 499], [500, 999]]);
  await assert.rejects(loadDeckCardPrints(client(rows, 500), [1]), /画像情報/);
});
