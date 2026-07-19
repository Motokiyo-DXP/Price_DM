import assert from "node:assert/strict";
import test from "node:test";
import { validatePriceCorrectionBody } from "./price-correction-validation.ts";

function validBody(overrides = {}) {
  return {
    priceRecordId: 12,
    salePrice: 980,
    buyPrice: null,
    stockStatus: "in_stock",
    observedOn: "2026-02-28",
    note: " 店頭表示 ",
    reason: " 入力価格の訂正 ",
    ...overrides,
  };
}

test("有効な申請を正規化する", () => {
  assert.deepEqual(validatePriceCorrectionBody(validBody()), {
    priceRecordId: 12,
    salePrice: 980,
    buyPrice: null,
    stockStatus: "in_stock",
    observedOn: "2026-02-28",
    note: "店頭表示",
    reason: "入力価格の訂正",
  });
});

test("販売価格と買取価格の少なくとも一方を必須にする", () => {
  assert.equal(
    validatePriceCorrectionBody(validBody({ salePrice: null, buyPrice: null })),
    null,
  );
  assert.notEqual(
    validatePriceCorrectionBody(validBody({ salePrice: 0, buyPrice: null })),
    null,
  );
});

test("価格は0以上の安全な整数だけを受け付ける", () => {
  for (const salePrice of [-1, 10.5, "100", Number.POSITIVE_INFINITY]) {
    assert.equal(
      validatePriceCorrectionBody(validBody({ salePrice })),
      null,
      String(salePrice),
    );
  }
});

test("価格記録IDは正の安全な整数だけを受け付ける", () => {
  for (const priceRecordId of [0, -1, 1.5, "12", Number.MAX_VALUE]) {
    assert.equal(
      validatePriceCorrectionBody(validBody({ priceRecordId })),
      null,
      String(priceRecordId),
    );
  }
});

test("定義済みの在庫状態だけを受け付ける", () => {
  const statuses = [
    "in_stock",
    "low_stock",
    "out_of_stock",
    "unknown",
    "buying",
    "buying_paused",
  ];
  for (const stockStatus of statuses) {
    assert.notEqual(
      validatePriceCorrectionBody(validBody({ stockStatus })),
      null,
      stockStatus,
    );
  }
  assert.equal(
    validatePriceCorrectionBody(validBody({ stockStatus: "invalid" })),
    null,
  );
});

test("実在するISO日付だけを受け付ける", () => {
  assert.notEqual(
    validatePriceCorrectionBody(validBody({ observedOn: "2024-02-29" })),
    null,
  );
  for (const observedOn of [
    "0000-01-01",
    "2026-02-29",
    "2026-13-01",
    "2026-01-32",
    "26-01-01",
  ]) {
    assert.equal(
      validatePriceCorrectionBody(validBody({ observedOn })),
      null,
      observedOn,
    );
  }
});

test("理由とメモの文字数上限を検証する", () => {
  assert.equal(
    validatePriceCorrectionBody(validBody({ reason: "   " })),
    null,
  );
  assert.equal(
    validatePriceCorrectionBody(validBody({ reason: "a".repeat(2001) })),
    null,
  );
  assert.equal(
    validatePriceCorrectionBody(validBody({ note: "a".repeat(2001) })),
    null,
  );
  assert.notEqual(
    validatePriceCorrectionBody(
      validBody({ reason: "a".repeat(2000), note: "a".repeat(2000) }),
    ),
    null,
  );
});

test("オブジェクト以外の入力を拒否する", () => {
  for (const input of [null, undefined, [], "request", 12]) {
    assert.equal(validatePriceCorrectionBody(input), null);
  }
});
