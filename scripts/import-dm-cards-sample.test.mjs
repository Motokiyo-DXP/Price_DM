import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedByRobots,
  parseArguments,
  parseCardDetail,
  parseCardList,
  parseOfficialCardPowerValue,
} from "./import-dm-cards-sample.mjs";

function cardFace({ civilization = "光", cost = "3", power = "", cardType = "クリーチャー", race = "", abilities = "", flavor = "" } = {}) {
  return `
    <div class="cardDetail">
      <table><tbody><tr><th><p>カードの種類</p></th><td class="type">${cardType}</td><th><p>文明</p></th><td class="civil">${civilization}</td></tr></tbody></table>
      <table><tbody><tr><th><p>コスト</p></th><td class="cost">${cost}</td></tr></tbody></table>
      <table><tbody><tr><th><p>パワー</p></th><td class="power">${power}</td></tr></tbody></table>
      <table><tbody><tr><th><p>種族</p></th><td class="race">${race}</td></tr></tbody></table>
      <table><tbody><tr><th class="full"><p>特殊能力</p></th></tr><tr><td class="skills full">${abilities}</td></tr></tbody></table>
      <table><tbody><tr><th class="full"><p>フレーバー</p></th></tr><tr><td class="flavor full">${flavor}</td></tr></tbody></table>
    </div>
  `;
}

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

test("parseCardDetail extracts existing index fields and one-face races/rules text", () => {
  const html = `
    <h3 class="card-name">
      竜皇神 ボルシャック・バクテラス
      <span class="packname">(DM26EX2 MC1/30)</span>
    </h3>
    <ul class="productCardList">
      <li><a href="/product/dm26ex2/">DM26-EX2 悪感謝祭 カリスマBEST</a></li>
      <li><a href="/product/dm25bd1/">DM25-BD1 ボルシャックの書</a></li>
    </ul>
    ${cardFace({
      civilization: "光/火",
      cost: "10",
      power: "17000",
      race: "ヒューマノイド/アーマード・ドラゴン",
      abilities: "<li>能力１。</li><li>能力２。</li>",
      flavor: "これはフレーバー。",
    })}
  `;

  assert.deepEqual(
    parseCardDetail(
      html,
      "https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-MC001",
    ),
    {
      card_number: "DM26EX2 MC1/30",
      card_texts: ["能力１。\n能力２。"],
      card_types: ["クリーチャー"],
      civilizations: ["light", "fire"],
      cost: 10,
      cost_is_infinite: false,
      name: "竜皇神 ボルシャック・バクテラス",
      name_kana: null,
      official_url:
        "https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-MC001",
      power_text: "17000",
      power_value: 17000,
      product_name: "DM26-EX2 悪感謝祭 カリスマBEST",
      races: ["ヒューマノイド", "アーマード・ドラゴン"],
    },
  );
});

test("parseCardDetail normalizes Unicode race notation without fuzzy-merging distinct names", () => {
  const html = `<h3 class="card-name">表記正規化</h3>${cardFace({
    race: "アーマード･ドラゴン／ヒューマノイド",
  })}`;
  const parsed = parseCardDetail(html, "https://dm.takaratomy.co.jp/card/detail/?id=race-normalization");
  assert.deepEqual(parsed.races, ["アーマード・ドラゴン", "ヒューマノイド"]);
});

test("printed infinity cost and power stay distinct from missing values", () => {
  const parsed = parseCardDetail(
    `<h3 class="card-name">∞龍 ゲンムエンペラー</h3>${cardFace({ cost: "∞", power: "∞", race: "ドラゴン" })}`,
    "https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD001",
  );
  assert.equal(parsed.cost, null);
  assert.equal(parsed.cost_is_infinite, true);
  assert.equal(parsed.power_text, "∞");
  assert.equal(parsed.power_value, null);
});

test("printed 0000+ keeps its form without parsing ability modifiers as base power", () => {
  const parsed = parseCardDetail(
    `<h3 class="card-name">圧倒するレオパルズ・ホーン</h3>${cardFace({
      cost: "6",
      power: "0000+",
      race: "ビーストフォーク",
      abilities: "このクリーチャーのパワーを+1000する。",
    })}`,
    "https://dm.takaratomy.co.jp/card/detail/?id=dm26rp1-006",
  );
  assert.equal(parsed.power_text, "0000+");
  assert.equal(parsed.power_value, 0);
  assert.equal(parseOfficialCardPowerValue("１２３４"), 1234);
  assert.equal(parseOfficialCardPowerValue("3000+"), null);
  assert.equal(parseOfficialCardPowerValue("未知"), null);
});

test("spells with no printed power keep both power fields null", () => {
  const parsed = parseCardDetail(
    `<h3 class="card-name">無限皇帝の顕現</h3>${cardFace({ cardType: "呪文", cost: "2", race: "" })}`,
    "https://dm.takaratomy.co.jp/card/detail/?id=dmrp15-039",
  );
  assert.equal(parsed.cost, 2);
  assert.equal(parsed.cost_is_infinite, false);
  assert.equal(parsed.power_text, null);
  assert.equal(parsed.power_value, null);
});

test("parseCardDetail keeps twin-pact rules per face and unions races without the race-less spell face", () => {
  const html = `
    <h3 class="card-name">暴発秘宝ベンゾ / 星龍の暴発</h3>
    ${cardFace({ civilization: "闇", cost: "4", race: "パンドラボックス", abilities: "<li>クリーチャー側の能力。</li>" })}
    ${cardFace({ civilization: "光", cost: "7", cardType: "呪文", race: "", abilities: "<li>呪文側の能力。</li>" })}
  `;
  const parsed = parseCardDetail(html, "https://dm.takaratomy.co.jp/card/detail/?id=test-twin");
  assert.deepEqual(parsed.civilizations, ["darkness", "light"]);
  assert.deepEqual(parsed.card_types, ["クリーチャー", "呪文"]);
  assert.deepEqual(parsed.races, ["パンドラボックス"]);
  assert.deepEqual(parsed.card_texts, ["クリーチャー側の能力。", "呪文側の能力。"]);
});

test("parseCardDetail keeps official image alt text and line breaks inside an ability", () => {
  const html = `<h3 class="card-name">画像キーワード</h3>${cardFace({
    abilities: '<li><img src="keyword.png" alt="S・トリガー"> 次から選ぶ。<br>効果を解決する。</li>',
  })}`;
  const parsed = parseCardDetail(html, "https://dm.takaratomy.co.jp/card/detail/?id=alt-text");
  assert.deepEqual(parsed.card_texts, ["S・トリガー 次から選ぶ。\n効果を解決する。"]);
});

test("parseCardDetail represents a successfully parsed no-ability face as an empty string", () => {
  const html = `<h3 class="card-name">能力なしカード</h3>${cardFace({ race: "ビーストフォーク", abilities: "", flavor: "フレーバーのみ。" })}`;
  const parsed = parseCardDetail(html, "https://dm.takaratomy.co.jp/card/detail/?id=no-ability");
  assert.deepEqual(parsed.card_texts, [""]);
  assert.deepEqual(parsed.races, ["ビーストフォーク"]);
});

test("parseCardDetail fails when the official special-ability section is missing", () => {
  const malformed = '<h3 class="card-name">構造不明</h3><div class="cardDetail"><table><tr><th>種族</th><td class="race"></td></tr></table></div>';
  assert.throws(
    () => parseCardDetail(malformed, "https://dm.takaratomy.co.jp/card/detail/?id=missing-section"),
    /special-ability section/,
  );
});

test("parseCardDetail does not attach the first unrelated product", () => {
  const html = `
    <h3 class="card-name">テストカード<span class="packname">(DM1 1/110)</span></h3>
    <ul class="productCardList">
      <li><a href="/product/dm26sd1/">DM26-SD1 別の商品</a></li>
    </ul>
    ${cardFace({ civilization: "火", cost: "1", race: "ドラゴン", abilities: "<li>ブレイカー。</li>" })}
  `;
  const parsed = parseCardDetail(html, "https://dm.takaratomy.co.jp/card/detail/?id=dm1-001");
  assert.equal(parsed.product_name, null);
});
