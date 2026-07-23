import assert from "node:assert/strict";
import test from "node:test";
import { adminLoginErrorMessage } from "./admin-login-feedback.ts";

test("メール送信のレート制限を利用者向け文言へ変換する", () => {
  const expected =
    "メール送信回数の上限に達しました。時間をおいてから再試行してください。";
  assert.equal(adminLoginErrorMessage({ status: 429 }), expected);
  assert.equal(
    adminLoginErrorMessage({ code: "over_email_send_rate_limit" }),
    expected,
  );
  assert.equal(adminLoginErrorMessage({ message: "Email rate limit exceeded" }), expected);
});

test("内部エラーの詳細を表示せず安全な共通文言へ変換する", () => {
  const expected =
    "ログイン用メールを送信できませんでした。時間をおいて再試行してください。";
  assert.equal(adminLoginErrorMessage(new Error("internal details")), expected);
  assert.equal(adminLoginErrorMessage(null), expected);
});
