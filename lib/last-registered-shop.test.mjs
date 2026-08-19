import assert from "node:assert/strict";
import test from "node:test";
import {
  readLastRegisteredShop,
  writeLastRegisteredShop,
} from "./last-registered-shop.ts";

function createStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
  };
}

test("最後に登録した店舗を安全に保存して読み込む", () => {
  const storage = createStorage();
  const shop = {
    id: 47,
    name: "竜星のPAO秋葉原ロケット無線店",
    prefecture: "東京都",
    municipality: "",
  };

  assert.equal(writeLastRegisteredShop(shop, () => storage), true);
  assert.deepEqual(readLastRegisteredShop(() => storage), shop);
});

test("壊れた値や不正な店舗は入力済み店舗として復元しない", () => {
  assert.equal(readLastRegisteredShop(() => createStorage("{")), null);
  assert.equal(
    writeLastRegisteredShop(
      { id: 0, name: "不正", prefecture: "東京都", municipality: "" },
      () => createStorage(),
    ),
    false,
  );
});
