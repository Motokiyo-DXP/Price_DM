import assert from "node:assert/strict";
import test from "node:test";
import { validateShopSearchMetadataInput } from "./admin-shop-search-metadata-validation.ts";

test("店舗検索情報を整形して重複別名を除く", () => {
  assert.deepEqual(
    validateShopSearchMetadataInput("31", " ふらっとこうぼう ", "フラット工房\nflat工房,フラット工房"),
    { shopId: 31, nameKana: "ふらっとこうぼう", aliases: ["フラット工房", "flat工房"] },
  );
});

test("不正な店舗IDと上限超過の別名を拒否する", () => {
  assert.equal(validateShopSearchMetadataInput("01", "", ""), null);
  assert.equal(validateShopSearchMetadataInput("1", "a".repeat(201), ""), null);
  assert.equal(validateShopSearchMetadataInput("1", "", Array.from({ length: 21 }, (_, index) => `別名${index}`).join("\n")), null);
});
