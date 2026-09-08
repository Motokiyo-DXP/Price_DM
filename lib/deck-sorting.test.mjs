import assert from "node:assert/strict";
import test from "node:test";

import { sortDeckCards, sortSearchCards } from "./deck-sorting.ts";

const deck = [
  { name: "中", quantity: 2, cost: 5 },
  { name: "不明", quantity: 4, cost: null },
  { name: "小", quantity: 1, cost: 2 },
];

test("コスト順は既知コストを昇順・降順に並べ、不明値を常に末尾へ置く", () => {
  assert.deepEqual(sortDeckCards(deck, "cost", "asc").map((card) => card.name), ["小", "中", "不明"]);
  assert.deepEqual(sortDeckCards(deck, "cost", "desc").map((card) => card.name), ["中", "小", "不明"]);
});

test("追加順・カード名順・枚数順で方向を切り替えられる", () => {
  assert.deepEqual(sortDeckCards(deck, "added", "desc").map((card) => card.name), ["小", "不明", "中"]);
  assert.deepEqual(sortDeckCards(deck, "quantity", "asc").map((card) => card.quantity), [1, 2, 4]);
  assert.deepEqual(sortDeckCards(deck, "quantity", "desc").map((card) => card.quantity), [4, 2, 1]);
});

test("検索結果の全キーで方向を切り替えられる", () => {
  const results = [
    { name: "B", print_count: 2, newestPrintId: 20 },
    { name: "A", print_count: 5, newestPrintId: 10 },
  ];
  assert.deepEqual(sortSearchCards(results, "relevance", "desc").map((card) => card.name), ["A", "B"]);
  assert.deepEqual(sortSearchCards(results, "name", "asc").map((card) => card.name), ["A", "B"]);
  assert.deepEqual(sortSearchCards(results, "prints", "desc").map((card) => card.print_count), [5, 2]);
  assert.deepEqual(sortSearchCards(results, "newest", "asc").map((card) => card.newestPrintId), [10, 20]);
});
test("実データの一部だけcost未登録でも既知コストを昇順にし未登録を末尾へ置く", () => {
  const mixed = [4, 5, 6, 8, null, 3, 5, 6, 5, 9, 4].map((cost, index) => ({ name: `カード${index}`, quantity: 1, cost }));
  assert.deepEqual(sortDeckCards(mixed, "cost", "asc").map((card) => card.cost), [3, 4, 4, 5, 5, 5, 6, 6, 8, 9, null]);
});
