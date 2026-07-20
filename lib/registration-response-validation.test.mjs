import assert from "node:assert/strict";
import test from "node:test";
import {
  parseApiErrorCode,
  parseRegistrationSessionRpcResult,
  parseRegistrationSessionStatusResponse,
  parseShopCandidateResponse,
} from "./registration-response-validation.ts";

const token = "a1".repeat(32);
const expiresAt = "2026-08-03T12:34:56.000Z";

test("PINセッションRPCの正常な応答を変換する", () => {
  assert.deepEqual(
    parseRegistrationSessionRpcResult({
      status: "ok",
      session_token: token,
      expires_at: expiresAt,
    }),
    { status: "ok", sessionToken: token, expiresAt },
  );
  for (const status of ["invalid_pin", "rate_limited", "not_configured"]) {
    assert.deepEqual(parseRegistrationSessionRpcResult({ status }), { status });
  }
});

test("PINセッションRPCの未知ステータスや不正な秘密値を拒否する", () => {
  for (const value of [
    null,
    [],
    { status: "unknown" },
    { status: "ok", session_token: "short", expires_at: expiresAt },
    { status: "ok", session_token: token, expires_at: "not-a-date" },
  ]) {
    assert.equal(parseRegistrationSessionRpcResult(value), null);
  }
});

test("保存済みPINセッションの状態応答を検証する", () => {
  assert.deepEqual(
    parseRegistrationSessionStatusResponse({ authenticated: true, expiresAt }),
    { authenticated: true, expiresAt },
  );
  assert.deepEqual(
    parseRegistrationSessionStatusResponse({ authenticated: false }),
    { authenticated: false, expiresAt: null },
  );
  assert.equal(
    parseRegistrationSessionStatusResponse({ authenticated: true }),
    null,
  );
});

test("店舗候補APIの成功応答に正のIDを要求する", () => {
  assert.deepEqual(
    parseShopCandidateResponse({ status: "pending", candidate_id: 12 }),
    { status: "pending", candidateId: 12 },
  );
  assert.deepEqual(
    parseShopCandidateResponse({ status: "already_approved", shop_id: 34 }),
    { status: "already_approved", shopId: 34 },
  );
  for (const value of [
    { status: "pending" },
    { status: "pending", candidate_id: 0 },
    { status: "already_approved", shop_id: 1.5 },
    { status: "invalid_session" },
  ]) {
    assert.equal(parseShopCandidateResponse(value), null);
  }
});

test("APIエラーコードは限定した形式だけを受け付ける", () => {
  assert.equal(parseApiErrorCode({ error: "session_required" }), "session_required");
  assert.equal(parseApiErrorCode({ error: "Session required" }), null);
  assert.equal(parseApiErrorCode({ error: 123 }), null);
});
