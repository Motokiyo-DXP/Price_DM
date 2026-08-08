import assert from "node:assert/strict";
import test from "node:test";
import { createCommerceLinks } from "./commerce-links.ts";

test("デュエル・マスターズではフリマと専門通販を返す", () => {
  const links = createCommerceLinks("引き裂かれし永劫、エムラクール", "デュエル・マスターズ");

  assert.deepEqual(links.map((link) => link.name), [
    "メルカリ",
    "カードラッシュ",
    "カーナベル",
    "CBトレコロ",
  ]);
  assert.match(links[0].href, /^https:\/\/jp\.mercari\.com\/search\?keyword=/);
  assert.ok(links[0].href.includes(encodeURIComponent("引き裂かれし永劫、エムラクール")));
  assert.ok(links[1].href.includes(encodeURIComponent("引き裂かれし永劫、エムラクール")));
  assert.ok(links[2].href.includes("genre=7"));
});

test("他TCGでは汎用フリマ検索だけを返す", () => {
  const links = createCommerceLinks("テストカード", "ポケモンカードゲーム");

  assert.equal(links.length, 1);
  assert.equal(links[0].name, "メルカリ");
});

test("空のカード名ではリンクを作らない", () => {
  assert.deepEqual(createCommerceLinks("   ", "デュエル・マスターズ"), []);
});
