import assert from "node:assert/strict";
import test from "node:test";
import {
  isIsoCalendarDate,
  optionalInteger,
  STOCK_STATUSES,
} from "./price-input-validation.ts";

test("省略可能な価格とIDを0以上の安全な整数へ正規化する", () => {
  for (const empty of [null, undefined, ""]) {
    assert.equal(optionalInteger(empty), null);
  }
  for (const valid of [0, 1, Number.MAX_SAFE_INTEGER]) {
    assert.equal(optionalInteger(valid), valid);
  }
  for (const invalid of [-1, 1.5, "100", Number.POSITIVE_INFINITY]) {
    assert.equal(optionalInteger(invalid), undefined);
  }
});

test("実在するISOカレンダー日付だけを受け付ける", () => {
  for (const valid of ["0001-01-01", "2024-02-29", "2026-12-31"]) {
    assert.equal(isIsoCalendarDate(valid), true, valid);
  }
  for (const invalid of [
    "0000-01-01",
    "2026-02-29",
    "2026-13-01",
    "2026-01-32",
    "26-01-01",
    null,
  ]) {
    assert.equal(isIsoCalendarDate(invalid), false, String(invalid));
  }
});

test("価格APIで利用可能な在庫状態を固定する", () => {
  assert.deepEqual([...STOCK_STATUSES], [
    "in_stock",
    "low_stock",
    "out_of_stock",
    "unknown",
    "buying",
    "buying_paused",
  ]);
});
