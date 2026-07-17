import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedByRobots,
  parseArguments,
  parseCardDetail,
  parseCardList,
} from "./import-dm-cards-sample.mjs";

test("parseArguments enforces the sample limits", () => {
  assert.deepEqual(parseArguments([]), { delayMs: 1_000, limit: 20, page: 1 });
  assert.throws(() => parseArguments(["--limit=51"]), /cannot exceed 50/);
  assert.throws(() => parseArguments(["--delay-ms=100"]), /cannot be lower/);
});

test("isAllowedByRobots uses the most specific matching rule", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /card/",
    "Allow: /card/detail/",
  ].join("\n");

  assert.equal(isAllowedByRobots(robots, "/card/"), false);
  assert.equal(isAllowedByRobots(robots, "/card/detail/"), true);
});

test("parseCardList returns unique official detail URLs", () => {
  const html = `
    <span id="total_count">22,943</span>
    <div id="cardlist">
      <a href="/card/detail/?id=dm-test-001"></a>
      <a data-href="/card/detail/?id=dm-test-001" href="/card/detail/?id=dm-test-001"></a>
      <a href="/card/detail/?id=dm-test-002"></a>
    </div>
  `;

  assert.deepEqual(parseCardList(html), {
    detailUrls: [
      "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-001",
      "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-002",
    ],
    totalAvailable: 22_943,
  });
});

test("parseCardDetail extracts only the card index fields", () => {
  const html = `
    <h3 class="card-name">
      竜皇神 ボルシャック・バクテラス
      <span class="packname">(DM26EX2 MC1/30)</span>
    </h3>
    <ul class="productCardList">
      <li><a href="/product/dm26ex2/">DM26-EX2 悪感謝祭 カリスマBEST</a></li>
      <li><a href="/product/dm25bd1/">DM25-BD1 ボルシャックの書</a></li>
    </ul>
  `;

  assert.deepEqual(
    parseCardDetail(
      html,
      "https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-MC001",
    ),
    {
      card_number: "DM26EX2 MC1/30",
      name: "竜皇神 ボルシャック・バクテラス",
      name_kana: null,
      official_url:
        "https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-MC001",
      product_name: "DM26-EX2 悪感謝祭 カリスマBEST",
    },
  );
});
