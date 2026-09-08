import assert from "node:assert/strict";
import test from "node:test";
import { mapMarketSummaryRow } from "./market-data-mapping.ts";

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
    is_stale: true,
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

test("公開相場行を画面用カードへ変換する", () => {
  assert.deepEqual(mapMarketSummaryRow(summaryRow()), {
    aliases: ["別名", "べつめい"],
    buyPrice: 700,
    buyRecordCount: 2,
    buyTrend: "down",
    game: "デュエル・マスターズ",
    id: "438",
    imageUrl: null,
    isStale: true,
    name: "アーテル・ゴルギーニ",
    nameKana: "あーてる・ごるぎーに",
    printCount: 4,
    salePrice: 1000,
    saleRecordCount: 3,
    saleTrend: "up",
    stock: "在庫あり",
    updatedAt: "2026-07-17",
    usesPrintFallback: true,
  });
});

test("省略値と未知の列挙値を安全な表示値へ変換する", () => {
  const row = summaryRow({
    aliases: ["有効", "", "   ", 123, null],
    aliases_kana: "不正な配列",
    buy_record_count: null,
    buy_trend: "unexpected",
    game_name: "",
    is_stale: null,
    name_kana: "   ",
    print_count: null,
    sale_record_count: null,
    sale_trend: null,
    stock_status: "unexpected",
    uses_print_fallback: null,
  });

  const card = mapMarketSummaryRow(row);
  assert.equal(card?.game, "TCG 未設定");
  assert.equal(card?.nameKana, undefined);
  assert.deepEqual(card?.aliases, ["有効"]);
  assert.equal(card?.saleTrend, "unknown");
  assert.equal(card?.buyTrend, "unknown");
  assert.equal(card?.stock, "不明");
  assert.equal(card?.printCount, 0);
  assert.equal(card?.saleRecordCount, 0);
  assert.equal(card?.buyRecordCount, 0);
  assert.equal(card?.isStale, false);
  assert.equal(card?.usesPrintFallback, false);
});

test("不正な価格・件数・日付を安全な表示値へ変換する", () => {
  const card = mapMarketSummaryRow(
    summaryRow({
      buy_price: Number.POSITIVE_INFINITY,
      buy_record_count: -1,
      last_observed_on: "2026-02-31",
      print_count: 1.5,
      sale_price: -100,
      sale_record_count: Number.NaN,
    }),
  );

  assert.equal(card?.salePrice, null);
  assert.equal(card?.buyPrice, null);
  assert.equal(card?.printCount, 0);
  assert.equal(card?.saleRecordCount, 0);
  assert.equal(card?.buyRecordCount, 0);
  assert.equal(card?.updatedAt, null);
});

test("画面を識別できない相場行を除外する", () => {
  assert.equal(mapMarketSummaryRow(summaryRow({ canonical_card_id: null })), null);
  assert.equal(mapMarketSummaryRow(summaryRow({ canonical_card_id: 0 })), null);
  assert.equal(mapMarketSummaryRow(summaryRow({ canonical_card_id: 1.5 })), null);
  assert.equal(mapMarketSummaryRow(summaryRow({ name: null })), null);
  assert.equal(mapMarketSummaryRow(summaryRow({ name: "" })), null);
  assert.equal(mapMarketSummaryRow(summaryRow({ name: "   " })), null);
});
