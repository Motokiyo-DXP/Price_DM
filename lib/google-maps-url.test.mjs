import assert from "node:assert/strict";
import test from "node:test";
import { createGoogleMapsSearchUrl } from "./google-maps-url.ts";

test("店舗名をGoogle Maps検索URLへ安全に変換する", () => {
  const result = createGoogleMapsSearchUrl("  flat工房 秋葉原店  ");
  const url = new URL(result);

  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/search/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "flat工房 秋葉原店");
});

test("店舗名がない価格にはリンクを作らない", () => {
  assert.equal(createGoogleMapsSearchUrl(""), null);
  assert.equal(createGoogleMapsSearchUrl("   "), null);
  assert.equal(createGoogleMapsSearchUrl("店舗未設定"), null);
});
