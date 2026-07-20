import assert from "node:assert/strict";
import test from "node:test";
import {
  mapRegistrationCardOptions,
  mapRegistrationCardPrints,
  mapRegistrationGames,
  mapRegistrationShopOptions,
} from "./registration-lookup-mapping.ts";

test("登録画面用TCG一覧を必要な表示値へ変換する", () => {
  assert.deepEqual(
    mapRegistrationGames([
      { id: 1, slug: "duel-masters", name: "デュエル・マスターズ", ignored: true },
      { id: 0, slug: "invalid", name: "除外" },
      { id: 2, slug: "Invalid Slug", name: "除外" },
    ]),
    [{ id: 1, slug: "duel-masters", name: "デュエル・マスターズ" }],
  );
  assert.deepEqual(mapRegistrationGames(null), []);
});

test("カード候補は正のID・表示名・非負の収録数だけを受け付ける", () => {
  assert.deepEqual(
    mapRegistrationCardOptions([
      { id: 10, name: "ボルメテウス", print_count: 3 },
      { id: 11, name: "", print_count: 1 },
      { id: 12, name: "不正", print_count: -1 },
    ]),
    [{ id: 10, name: "ボルメテウス", print_count: 3 }],
  );
});

test("収録版候補は安全なIDと文字列だけを受け付ける", () => {
  assert.deepEqual(
    mapRegistrationCardPrints([
      { id: 20, card_number: "DM-01", product_name: "第1弾" },
      { id: 21, card_number: null, product_name: "不正" },
      { id: 1.5, card_number: "DM-02", product_name: "不正" },
    ]),
    [{ id: 20, card_number: "DM-01", product_name: "第1弾" }],
  );
});

test("店舗候補は登録に使えるIDと表示文字列だけを受け付ける", () => {
  assert.deepEqual(
    mapRegistrationShopOptions([
      { id: 30, name: "カードショップ", prefecture: "東京都", municipality: "千代田区" },
      { id: -1, name: "不正", prefecture: "", municipality: "" },
      { id: 31, name: "", prefecture: "東京都", municipality: "" },
    ]),
    [{ id: 30, name: "カードショップ", prefecture: "東京都", municipality: "千代田区" }],
  );
  assert.deepEqual(mapRegistrationShopOptions({}), []);
});
