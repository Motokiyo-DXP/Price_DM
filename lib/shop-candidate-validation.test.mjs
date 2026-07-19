import assert from "node:assert/strict";
import test from "node:test";
import { validateShopCandidateBody } from "./shop-candidate-validation.ts";

function validBody(overrides = {}) {
  return {
    name: " カードショップ例 ",
    prefecture: " 東京都 ",
    municipality: " 千代田区 ",
    addressLine: " 神田1-2-3 ",
    websiteUrl: " https://example.com/shop ",
    ...overrides,
  };
}

test("有効な店舗候補を正規化する", () => {
  assert.deepEqual(validateShopCandidateBody(validBody()), {
    ok: true,
    value: {
      name: "カードショップ例",
      prefecture: "東京都",
      municipality: "千代田区",
      addressLine: "神田1-2-3",
      websiteUrl: "https://example.com/shop",
    },
  });
});

test("必須の店舗名と各項目の文字数上限を検証する", () => {
  for (const name of ["", "   ", "a".repeat(201)]) {
    assert.deepEqual(validateShopCandidateBody(validBody({ name })), {
      ok: false,
      error: "invalid_shop",
    });
  }

  for (const overrides of [
    { prefecture: "a".repeat(21) },
    { municipality: "a".repeat(101) },
    { addressLine: "a".repeat(301) },
    { websiteUrl: `https://example.com/${"a".repeat(481)}` },
  ]) {
    assert.deepEqual(validateShopCandidateBody(validBody(overrides)), {
      ok: false,
      error: "too_long",
    });
  }
});

test("実在するHTTPまたはHTTPS形式のURLだけを受け付ける", () => {
  for (const websiteUrl of ["", "http://example.com", "https://example.jp/shop"]) {
    assert.equal(validateShopCandidateBody(validBody({ websiteUrl })).ok, true);
  }

  for (const websiteUrl of [
    "https://",
    "example.com",
    "ftp://example.com",
    "https://user:password@example.com",
  ]) {
    assert.deepEqual(validateShopCandidateBody(validBody({ websiteUrl })), {
      ok: false,
      error: "invalid_website_url",
    });
  }
});

test("オブジェクト以外の入力を拒否する", () => {
  for (const input of [null, undefined, [], "shop", 12]) {
    assert.deepEqual(validateShopCandidateBody(input), {
      ok: false,
      error: "invalid_request",
    });
  }
});
