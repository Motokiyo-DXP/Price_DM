import assert from "node:assert/strict";
import test from "node:test";
import { validateAdminShopDetailsInput } from "./admin-shop-details-validation.ts";

test("管理者の店舗詳細更新入力を整形する", () => {
  assert.deepEqual(
    validateAdminShopDetailsInput(
      "31",
      " flat工房 秋葉原店 ",
      " ふらっとこうぼう あきはばらてん ",
      "フラット工房\nFLAT工房,フラット工房",
      " 東京都 ",
      " 千代田区 ",
      " 外神田1-1-1 ",
      " https://example.com/shop ",
    ),
    {
      shopId: 31,
      name: "flat工房 秋葉原店",
      nameKana: "ふらっとこうぼう あきはばらてん",
      aliases: ["フラット工房", "FLAT工房"],
      prefecture: "東京都",
      municipality: "千代田区",
      addressLine: "外神田1-1-1",
      websiteUrl: "https://example.com/shop",
    },
  );
});

test("不正な店舗ID・都道府県・URLを拒否する", () => {
  assert.equal(
    validateAdminShopDetailsInput("01", "店舗A", "", "", "東京都", "", "", ""),
    null,
  );
  assert.equal(
    validateAdminShopDetailsInput("1", "店舗A", "", "", "東京", "", "", ""),
    null,
  );
  assert.equal(
    validateAdminShopDetailsInput("1", "店舗A", "", "", "東京都", "", "", "javascript:alert(1)"),
    null,
  );
});

