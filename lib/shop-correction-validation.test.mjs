import assert from "node:assert/strict";
import test from "node:test";
import { validateShopCorrectionBody } from "./shop-correction-validation.ts";

test("変更した項目だけを正規化する", () => {
  const result = validateShopCorrectionBody({
    shopId: 12,
    name: " 店舗名 改 ",
    aliases: [" 別名 ", "別名", ""],
    prefecture: "東京都",
    reason: " 表記が変わったため ",
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      shopId: 12,
      name: "店舗名 改",
      nameKana: "",
      aliases: ["別名"],
      prefecture: "東京都",
      municipality: "",
      addressLine: "",
      websiteUrl: "",
      reason: "表記が変わったため",
    },
  });
});

test("変更項目と理由を必須にする", () => {
  assert.deepEqual(validateShopCorrectionBody({ shopId: 1, reason: "理由" }), {
    ok: false,
    error: "no_changes",
  });
  assert.deepEqual(validateShopCorrectionBody({ shopId: 1, name: "新名称" }), {
    ok: false,
    error: "invalid_request",
  });
});

test("店舗ID、都道府県、URLを検証する", () => {
  assert.equal(validateShopCorrectionBody({ shopId: 0, name: "x", reason: "x" }).ok, false);
  assert.deepEqual(
    validateShopCorrectionBody({ shopId: 1, prefecture: "無効県", reason: "x" }),
    { ok: false, error: "invalid_prefecture" },
  );
  assert.deepEqual(
    validateShopCorrectionBody({ shopId: 1, websiteUrl: "javascript:alert(1)", reason: "x" }),
    { ok: false, error: "invalid_website_url" },
  );
});

test("文字数と別名件数を制限する", () => {
  assert.deepEqual(
    validateShopCorrectionBody({ shopId: 1, name: "a".repeat(201), reason: "x" }),
    { ok: false, error: "too_long" },
  );
  assert.deepEqual(
    validateShopCorrectionBody({
      shopId: 1,
      aliases: Array.from({ length: 21 }, (_, index) => `alias-${index}`),
      reason: "x",
    }),
    { ok: false, error: "too_long" },
  );
});
