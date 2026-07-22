import assert from "node:assert/strict";
import test from "node:test";
import { validateAdminShopRegistrationInput } from "./admin-shop-registration-validation.ts";

test("管理者の店舗登録入力を整形する", () => {
  assert.deepEqual(
    validateAdminShopRegistrationInput(
      "  カードショップ秋葉原  ",
      " かーどしょっぷあきはばら ",
      " アキバ店\n秋葉原カードショップ,アキバ店 ",
      " 東京都 ",
      " 千代田区 ",
      " 外神田1-1-1 ",
      " https://example.com/shop ",
      " 公式サイト確認済み ",
    ),
    {
      name: "カードショップ秋葉原",
      nameKana: "かーどしょっぷあきはばら",
      aliases: ["アキバ店", "秋葉原カードショップ"],
      prefecture: "東京都",
      municipality: "千代田区",
      addressLine: "外神田1-1-1",
      websiteUrl: "https://example.com/shop",
      reviewNote: "公式サイト確認済み",
    },
  );
});

test("任意項目は空文字で受け付ける", () => {
  assert.deepEqual(
    validateAdminShopRegistrationInput("店舗A", "", "", "東京都", "", "", "", ""),
    {
      name: "店舗A",
      nameKana: "",
      aliases: [],
      prefecture: "東京都",
      municipality: "",
      addressLine: "",
      websiteUrl: "",
      reviewNote: "",
    },
  );
});

test("必須項目と文字数を検証する", () => {
  for (const values of [
    ["", "", "", "東京都", "", "", "", ""],
    ["店舗A", "", "", "", "", "", "", ""],
    ["店舗A", "", "", "東京", "", "", "", ""],
    ["a".repeat(201), "", "", "東京都", "", "", "", ""],
    ["店舗A", "a".repeat(201), "", "東京都", "", "", "", ""],
    ["店舗A", "", "", "a".repeat(21), "", "", "", ""],
    ["店舗A", "", "", "東京都", "a".repeat(101), "", "", ""],
    ["店舗A", "", "", "東京都", "", "a".repeat(301), "", ""],
    ["店舗A", "", "", "東京都", "", "", "", "a".repeat(2001)],
    ["店舗A", "", Array.from({ length: 21 }, (_, index) => `別名${index}`).join("\n"), "東京都", "", "", "", ""],
  ]) {
    assert.equal(validateAdminShopRegistrationInput(...values), null);
  }
});

test("公式サイトURLはHTTPまたはHTTPSだけを受け付ける", () => {
  for (const url of ["example.com", "ftp://example.com", "javascript:alert(1)", "https://"] ) {
    assert.equal(
      validateAdminShopRegistrationInput("店舗A", "", "", "東京都", "", "", url, ""),
      null,
    );
  }
  assert.notEqual(
    validateAdminShopRegistrationInput("店舗A", "", "", "東京都", "", "", "http://example.com", ""),
    null,
  );
});
