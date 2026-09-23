import assert from "node:assert/strict";
import test from "node:test";
import { mapMarketSearchResults } from "./market-search-mapping.ts";

const canonicalRow = (overrides = {}) => ({
  game_name: "デュエル・マスターズ",
  game_slug: "duel-masters",
  id: 123,
  name: "未登録カード",
  name_kana: "みとうろくかーど",
  print_count: 2,
  ...overrides,
});

test("価格未登録の公式カードを空の相場情報付きで表示できる形にする", () => {
  const [card] = mapMarketSearchResults([canonicalRow()], new Map());

  assert.deepEqual(card, {
    aliases: [],
    buyPrice: null,
    buyRecordCount: 0,
    buyTrend: "unknown",
    game: "デュエル・マスターズ",
    id: "123",
    imageUrl: null,
    isStale: false,
    name: "未登録カード",
    nameKana: "みとうろくかーど",
    printCount: 2,
    salePrice: null,
    saleRecordCount: 0,
    saleTrend: "unknown",
    stock: "不明",
    updatedAt: null,
    usesPrintFallback: false,
  });
});

test("価格登録済みカードは相場情報を維持しつつ検索結果の画像を補完する", () => {
  const pricedCard = {
    ...mapMarketSearchResults([canonicalRow()], new Map())[0],
    salePrice: 980,
    saleRecordCount: 3,
  };

  const [card] = mapMarketSearchResults(
    [canonicalRow({ name: "RPC側の名前", image_key: "duel-masters/123" })],
    new Map([["123", pricedCard]]),
  );

  assert.notEqual(card, pricedCard);
  assert.equal(card.salePrice, 980);
  assert.equal(card.saleRecordCount, 3);
  assert.match(card.imageUrl, /duel-masters\/123\.webp$/);
  assert.equal(pricedCard.imageUrl, null);
});

test("ホーム専用RPCの最小レスポンスは相場を維持し、画像補完までは画像未登録として扱う", () => {
  const pricedCard = {
    ...mapMarketSearchResults([canonicalRow()], new Map())[0],
    imageUrl: "/cached-card.webp",
    salePrice: 980,
  };
  const [priced, unpriced] = mapMarketSearchResults(
    [canonicalRow(), canonicalRow({ id: 456, name: "未登録候補", print_count: 0 })],
    new Map([["123", pricedCard]]),
  );

  assert.equal(priced.imageUrl, "/cached-card.webp");
  assert.equal(priced.salePrice, 980);
  assert.equal(unpriced.imageUrl, null);
  assert.equal(unpriced.salePrice, null);
});

test("不正な検索結果行を除外する", () => {
  assert.deepEqual(
    mapMarketSearchResults(
      [canonicalRow({ id: 0 }), canonicalRow({ name: "" }), null],
      new Map(),
    ),
    [],
  );
});
