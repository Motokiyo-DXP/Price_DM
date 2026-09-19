import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSubmissionShop,
  selectShopOption,
  updateRecentRegistrationShops,
} from "./registration-shop-selection.ts";

const shops = [
  { id: 1, name: "A" },
  { id: 2, name: "B" },
  { id: 3, name: "C" },
];

test("Enter は active がなければ検索結果先頭を選ぶ", () => {
  assert.equal(selectShopOption({ activeIndex: -1, isComposing: false, options: shops, searchComplete: true }), shops[0]);
});

test("Enter は active の候補を選ぶ", () => {
  assert.equal(selectShopOption({ activeIndex: 1, isComposing: false, options: shops, searchComplete: true }), shops[1]);
});

test("IME 変換中・検索中・候補なしでは候補を自動選択しない", () => {
  assert.equal(selectShopOption({ activeIndex: -1, isComposing: true, options: shops, searchComplete: true }), null);
  assert.equal(selectShopOption({ activeIndex: -1, isComposing: false, options: shops, searchComplete: false }), null);
  assert.equal(selectShopOption({ activeIndex: -1, isComposing: false, options: [], searchComplete: true }), null);
});

test("送信時は明示選択を維持し、未選択なら検索結果先頭を使う", () => {
  assert.equal(resolveSubmissionShop({ selectedShop: shops[1], selection: { activeIndex: -1, isComposing: false, options: shops, searchComplete: true } }), shops[1]);
  assert.equal(resolveSubmissionShop({ selectedShop: null, selection: { activeIndex: -1, isComposing: false, options: shops, searchComplete: true } }), shops[0]);
});

test("最近使用店舗は再利用時に重複させず先頭へ移動し、5件に制限する", () => {
  const used = updateRecentRegistrationShops(
    updateRecentRegistrationShops(
      updateRecentRegistrationShops(
        updateRecentRegistrationShops([], shops[0]),
        shops[1],
      ),
      shops[2],
    ),
    shops[0],
  );
  assert.deepEqual(used.map((shop) => shop.name), ["A", "C", "B"]);

  const six = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: String(index + 1) }))
    .reduce((current, shop) => updateRecentRegistrationShops(current, shop), []);
  assert.deepEqual(six.map((shop) => shop.id), [6, 5, 4, 3, 2]);
});
