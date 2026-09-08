import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mapBestPriceRow,
  mapCardDetailRows,
  mapPriceHistoryRow,
  mapRecentRecordRow,
} from "./card-detail-data-mapping.ts";

function summaryRow(overrides = {}) {
  return {
    aliases: ["別名"],
    aliases_kana: ["べつめい"],
    buy_price: 700,
    buy_record_count: 2,
    buy_trend: "down",
    canonical_card_id: 438,
    game_id: 1,
    game_name: "デュエル・マスターズ",
    game_slug: "duel-masters",
    is_stale: false,
    last_observed_on: "2026-07-17",
    name: "アーテル・ゴルギーニ",
    name_kana: "あーてる・ごるぎーに",
    print_count: 4,
    sale_price: 1000,
    sale_record_count: 3,
    sale_trend: "up",
    stock_status: "in_stock",
    uses_print_fallback: true,
    ...overrides,
  };
}

function bestPriceRow(overrides = {}) {
  return {
    attribute_names: ["通常価格"],
    card_number: "22/74",
    card_print_id: 10,
    has_caution_attribute: false,
    is_stale: false,
    observed_on: "2026-07-17",
    price: 980,
    price_kind: "sale",
    product_name: "DM23-RP3",
    shop_id: 1,
    shop_name: "テスト店舗",
    stock_status: "in_stock",
    ...overrides,
  };
}

function historyRow(overrides = {}) {
  return {
    buy_price: 700,
    buy_record_count: 1,
    observed_on: "2026-07-17",
    sale_price: 1000,
    sale_record_count: 2,
    ...overrides,
  };
}

function recentRecordRow(overrides = {}) {
  return {
    attribute_names: ["通常価格"],
    buy_price: 700,
    card_number: "22/74",
    card_print_id: 10,
    contributor_name: "投稿者",
    is_stale: false,
    note: "店頭価格",
    observed_on: "2026-07-17",
    price_record_id: 99,
    product_name: "DM23-RP3",
    sale_price: 1000,
    shop_name: "テスト店舗",
    stock_status: "low_stock",
    ...overrides,
  };
}

test("カード詳細の全レスポンスを画面用データへ変換する", () => {
  const card = mapCardDetailRows(
    summaryRow(),
    [bestPriceRow(), bestPriceRow({ price: 720, price_kind: "buy" })],
    [historyRow()],
    [recentRecordRow()],
  );

  assert.equal(card?.id, "438");
  assert.equal(card?.bestSale?.price, 980);
  assert.equal(card?.bestBuy?.price, 720);
  assert.deepEqual(card?.priceHistory, [
    {
      buyPrice: 700,
      buyRecordCount: 1,
      observedOn: "2026-07-17",
      salePrice: 1000,
      saleRecordCount: 2,
    },
  ]);
  assert.deepEqual(card?.recentRecords[0], {
    attributeNames: ["通常価格"],
    buyPrice: 700,
    cardNumber: "22/74",
    id: "99",
    isStale: false,
    note: "店頭価格",
    observedOn: "2026-07-17",
    productName: "DM23-RP3",
    salePrice: 1000,
    shopName: "テスト店舗",
    stock: "残りわずか",
    stockStatus: "low_stock",
  });
});

test("未知の列挙値と不正な任意値を安全な表示値へ変換する", () => {
  const bestPrice = mapBestPriceRow(
    bestPriceRow({
      attribute_names: ["有効", 123, null, ""],
      card_number: "",
      has_caution_attribute: null,
      is_stale: null,
      product_name: null,
      shop_name: "",
      stock_status: "unexpected",
    }),
  );
  assert.deepEqual(bestPrice, {
    attributeNames: ["有効"],
    cardNumber: undefined,
    hasCautionAttribute: false,
    isStale: false,
    kind: "sale",
    observedOn: "2026-07-17",
    price: 980,
    productName: undefined,
    shopName: "店舗未設定",
    stock: "不明",
  });

  const recentRecord = mapRecentRecordRow(
    recentRecordRow({
      attribute_names: "不正な配列",
      buy_price: -1,
      note: "",
      sale_price: Number.NaN,
      shop_name: null,
      stock_status: "unexpected",
    }),
  );
  assert.equal(recentRecord?.salePrice, null);
  assert.equal(recentRecord?.buyPrice, null);
  assert.equal(recentRecord?.stockStatus, "unknown");
  assert.equal(recentRecord?.stock, "不明");
  assert.equal(recentRecord?.shopName, "店舗未設定");
  assert.deepEqual(recentRecord?.attributeNames, []);
  assert.equal(recentRecord?.note, undefined);
});

test("識別不能または表示不能な詳細行を除外する", () => {
  assert.equal(
    mapCardDetailRows(summaryRow({ canonical_card_id: 0 }), [], [], []),
    null,
  );
  assert.equal(mapBestPriceRow(bestPriceRow({ price_kind: "other" })), null);
  assert.equal(mapBestPriceRow(bestPriceRow({ price: -1 })), null);
  assert.equal(
    mapPriceHistoryRow(historyRow({ observed_on: "2026-02-31" })),
    null,
  );
  assert.equal(
    mapPriceHistoryRow(historyRow({ buy_price: null, sale_price: null })),
    null,
  );
  assert.equal(
    mapRecentRecordRow(recentRecordRow({ price_record_id: 0 })),
    null,
  );
});

test("件数・価格・最終更新日の不正値を安全な既定値へ変換する", () => {
  const card = mapCardDetailRows(
    summaryRow({
      buy_price: Number.POSITIVE_INFINITY,
      buy_record_count: -1,
      last_observed_on: "not-a-date",
      print_count: -4,
      sale_price: -100,
      sale_record_count: 1.5,
    }),
    [],
    [historyRow({ buy_record_count: -1, sale_record_count: 1.5 })],
    [],
  );

  assert.equal(card?.salePrice, null);
  assert.equal(card?.buyPrice, null);
  assert.equal(card?.saleRecordCount, 0);
  assert.equal(card?.buyRecordCount, 0);
  assert.equal(card?.printCount, 0);
  assert.equal(card?.updatedAt, null);
  assert.equal(card?.priceHistory[0].saleRecordCount, 0);
  assert.equal(card?.priceHistory[0].buyRecordCount, 0);
});

test("カード詳細にはスマホ専用の縮尺と横幅制御がある", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const page = readFileSync("app/cards/[id]/page.tsx", "utf8");
  assert.match(css, /\/\* Mobile card detail scale \*\/[\s\S]*@media\(max-width:620px\)/u);
  assert.match(css, /body:has\(\.card-detail\) main\{[^}]*overflow-x:hidden[^}]*width:100%/u);
  assert.match(css, /\.card-detail \.detail-heading h1\{[^}]*font-size:clamp\(22px,7vw,30px\)/u);
  assert.match(css, /\.card-detail \.best-price-filter-actions \.button\{[^}]*width:100%/u);
  assert.match(css, /\.card-detail \.history-chart-wrap\{[^}]*max-width:100%/u);
  assert.doesNotMatch(page, /card\.nameKana/u);
});
