import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAdminCandidateDeletionInput,
  validateAdminReviewInput,
} from "./admin-review-validation.ts";

test("削除対象候補IDは正の安全な10進整数だけを受け付ける", () => {
  assert.equal(validateAdminCandidateDeletionInput("42"), 42);
  for (const id of [null, 1, "", "0", "-1", "01", "1.5", " 1 ", String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(validateAdminCandidateDeletionInput(id), null, String(id));
  }
});

test("有効な管理者レビュー入力を正規化する", () => {
  assert.deepEqual(
    validateAdminReviewInput("42", "approved", " 公式サイト確認済み "),
    {
      id: 42,
      decision: "approved",
      reviewNote: "公式サイト確認済み",
    },
  );
  assert.deepEqual(validateAdminReviewInput("1", "rejected", null), {
    id: 1,
    decision: "rejected",
    reviewNote: "",
  });
});

test("IDは先頭ゼロのない正の安全な10進整数だけを受け付ける", () => {
  for (const id of [
    null,
    1,
    "",
    "0",
    "-1",
    "01",
    "1.5",
    "1e2",
    " 1 ",
    String(Number.MAX_SAFE_INTEGER + 1),
  ]) {
    assert.equal(validateAdminReviewInput(id, "approved", ""), null, String(id));
  }
});

test("定義済みの判断だけを受け付ける", () => {
  for (const decision of [null, "", "approve", "pending", 1]) {
    assert.equal(validateAdminReviewInput("1", decision, ""), null);
  }
});

test("レビュー注記は文字列または空値で2000文字以内に制限する", () => {
  assert.notEqual(
    validateAdminReviewInput("1", "approved", "a".repeat(2000)),
    null,
  );
  for (const reviewNote of ["a".repeat(2001), 12, {}, []]) {
    assert.equal(
      validateAdminReviewInput("1", "approved", reviewNote),
      null,
    );
  }
});
