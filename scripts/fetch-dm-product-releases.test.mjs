import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductCode, parseJapaneseReleaseDate, parseProductArchive } from "./fetch-dm-product-releases.mjs";

test("normalizes official product codes", () => {
  assert.equal(normalizeProductCode("DM25-RP1 商品名"), "DM25RP1");
  assert.equal(normalizeProductCode("dmex-08"), "DMEX08");
});

test("parses a validated Japanese release date", () => {
  assert.equal(parseJapaneseReleaseDate("2025年4月19日（土）"), "2025-04-19");
  assert.equal(parseJapaneseReleaseDate("2025年2月30日"), null);
});

test("extracts product release records from the official archive", () => {
  const html = `<link rel="next" href="/product/page/2/"><div class="itemList01_item"><h2 class="title">DM25-RP1 商品名</h2><div class="infoContainer"><dl><dt>発売日</dt><dd>2025年4月19日（土）</dd></dl></div><a href="/product/dm25rp1/#cardlist">カードリスト</a><a href="/product/dm25rp1/">商品詳細</a></div>`;
  assert.deepEqual(parseProductArchive(html, "https://dm.takaratomy.co.jp/product/"), { products: [{ product_code: "DM25RP1", product_name: "DM25-RP1 商品名", release_date: "2025-04-19", official_url: "https://dm.takaratomy.co.jp/product/dm25rp1/" }], nextUrl: "/product/page/2/" });
});
