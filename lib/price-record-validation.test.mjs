import assert from "node:assert/strict";
import test from "node:test";
import { validatePriceRecordBody } from "./price-record-validation.ts";

function validBody(overrides = {}) {
  return {
    canonicalCardId: 10,
    cardPrintId: 20,
    shopId: 30,
    salePrice: 980,
    buyPrice: null,
    stockStatus: "in_stock",
    observedOn: "2026-07-20",
    contributorName: " 投稿者 ",
    note: " 店頭価格 ",
    attributeSlugs: ["normal", "damaged", "normal"],
    ...overrides,
  };
}

test("有効な価格登録を正規化する", () => {
  assert.deepEqual(validatePriceRecordBody(validBody()), {
    ok: true,
    value: {
      canonicalCardId: 10,
      cardPrintId: 20,
      shopId: 30,
      salePrice: 980,
      buyPrice: null,
      stockStatus: "in_stock",
      observedOn: "2026-07-20",
      contributorName: "投稿者",
      note: "店頭価格",
      attributeSlugs: ["normal", "damaged"],
    },
  });
});

test("カードID、収録物ID、店舗IDは正の安全な整数だけを受け付ける", () => {
  for (const canonicalCardId of [0, -1, 1.5, "10", Number.MAX_VALUE]) {
    assert.deepEqual(validatePriceRecordBody(validBody({ canonicalCardId })), {
      ok: false,
      error: "card_required",
    });
  }
  for (const cardPrintId of [0, -1, 1.5, "20", Number.MAX_VALUE]) {
    assert.deepEqual(validatePriceRecordBody(validBody({ cardPrintId })), {
      ok: false,
      error: "invalid_request",
    });
  }
  for (const shopId of [0, -1, 1.5, "30", Number.MAX_VALUE]) {
    assert.deepEqual(validatePriceRecordBody(validBody({ shopId })), {
      ok: false,
      error: "invalid_shop",
    });
  }
  assert.equal(validatePriceRecordBody(validBody({ cardPrintId: null })).ok, true);
});

test("価格は0以上の安全な整数で少なくとも一方を必須にする", () => {
  for (const salePrice of [-1, 1.5, "980", Number.POSITIVE_INFINITY]) {
    assert.deepEqual(validatePriceRecordBody(validBody({ salePrice })), {
      ok: false,
      error: "invalid_price",
    });
  }
  assert.deepEqual(
    validatePriceRecordBody(validBody({ salePrice: null, buyPrice: null })),
    { ok: false, error: "price_required" },
  );
  assert.equal(validatePriceRecordBody(validBody({ salePrice: 0 })).ok, true);
});

test("在庫状態と実在する日付を検証する", () => {
  assert.deepEqual(
    validatePriceRecordBody(validBody({ stockStatus: "invalid" })),
    { ok: false, error: "invalid_stock_status" },
  );
  for (const observedOn of ["2026-02-29", "2026-13-01", "20-01-01"]) {
    assert.deepEqual(validatePriceRecordBody(validBody({ observedOn })), {
      ok: false,
      error: "invalid_date",
    });
  }
});

test("投稿者名とメモの文字数上限を検証する", () => {
  assert.deepEqual(
    validatePriceRecordBody(validBody({ contributorName: "a".repeat(101) })),
    { ok: false, error: "too_long" },
  );
  assert.deepEqual(
    validatePriceRecordBody(validBody({ note: "a".repeat(2001) })),
    { ok: false, error: "too_long" },
  );
});

test("属性スラッグの型、形式、件数を検証する", () => {
  assert.equal(
    validatePriceRecordBody(validBody({ attributeSlugs: undefined })).ok,
    true,
  );
  for (const attributeSlugs of [
    "normal",
    ["UPPER_CASE"],
    ["a".repeat(51)],
    [1],
    Array.from({ length: 11 }, (_, index) => `tag_${index}`),
  ]) {
    assert.deepEqual(validatePriceRecordBody(validBody({ attributeSlugs })), {
      ok: false,
      error: "invalid_request",
    });
  }
});

test("オブジェクト以外の入力を拒否する", () => {
  for (const input of [null, undefined, [], "price", 12]) {
    assert.deepEqual(validatePriceRecordBody(input), {
      ok: false,
      error: "invalid_request",
    });
  }
});
