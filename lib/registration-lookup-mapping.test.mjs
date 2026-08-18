import assert from "node:assert/strict";
import test from "node:test";
import {
  mapRegistrationCardOptions,
  mapRegistrationCardPrints,
  mapRegistrationGames,
  mapRegistrationShopOptions,
  mapRegistrationShopSearchPage,
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

test("地域情報が未入力の店舗も検索候補として受け付ける", () => {
  assert.deepEqual(
    mapRegistrationShopOptions([
      { id: 47, name: "竜星のPAO秋葉原ロケット無線店", prefecture: "東京都", municipality: null },
      { id: 364, name: "通販のPAO", prefecture: null, municipality: null },
      { id: 365, name: "不正な店舗", prefecture: 13, municipality: null },
    ]),
    [
      { id: 47, name: "竜星のPAO秋葉原ロケット無線店", prefecture: "東京都", municipality: "" },
      { id: 364, name: "通販のPAO", prefecture: "", municipality: "" },
    ],
  );
});

test("店舗検索ページから候補と総件数を安全に取り出す", () => {
  assert.deepEqual(
    mapRegistrationShopSearchPage([
      { id: 30, name: "店舗A", prefecture: "東京都", municipality: "千代田区", total_count: 25 },
      { id: 31, name: "店舗B", prefecture: "東京都", municipality: "新宿区", total_count: 25 },
    ]),
    {
      options: [
        { id: 30, name: "店舗A", prefecture: "東京都", municipality: "千代田区" },
        { id: 31, name: "店舗B", prefecture: "東京都", municipality: "新宿区" },
      ],
      totalCount: 25,
    },
  );
  assert.deepEqual(
    mapRegistrationShopSearchPage([
      {
        id: 47,
        name: "竜星のPAO秋葉原ロケット無線店",
        prefecture: "東京都",
        municipality: null,
        total_count: 3,
      },
      {
        id: 364,
        name: "通販のPAO",
        prefecture: null,
        municipality: null,
        total_count: 3,
      },
    ]),
    {
      options: [
        { id: 47, name: "竜星のPAO秋葉原ロケット無線店", prefecture: "東京都", municipality: "" },
        { id: 364, name: "通販のPAO", prefecture: "", municipality: "" },
      ],
      totalCount: 3,
    },
  );
  assert.deepEqual(
    mapRegistrationShopSearchPage([
      { id: 30, name: "店舗A", prefecture: "東京都", municipality: "千代田区", total_count: -1 },
    ]),
    { options: [], totalCount: 0 },
  );
});
