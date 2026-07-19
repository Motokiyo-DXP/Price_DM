import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPendingPriceCorrections,
  reviewPriceCorrection,
} from "./admin-price-corrections.ts";

function rpcClient(result) {
  const calls = [];
  return {
    calls,
    async rpc(functionName, args) {
      calls.push({ functionName, args });
      return result;
    },
  };
}

function correctionRow(overrides = {}) {
  return {
    id: 4,
    price_record_id: 9,
    card_name: "テストカード",
    shop_name: "カードショップ例",
    original_sale_price: 1000,
    original_buy_price: null,
    proposed_sale_price: 980,
    proposed_buy_price: null,
    proposed_stock_status: "in_stock",
    proposed_observed_on: "2026-07-20",
    proposed_note: null,
    reason: "価格表示の訂正",
    submitted_at: "2026-07-20T10:00:00Z",
    ...overrides,
  };
}

test("価格修正一覧RPCを呼び出して検証済みの行を返す", async () => {
  const row = correctionRow();
  const client = rpcClient({ data: [row], error: null });
  assert.deepEqual(await loadPendingPriceCorrections(client), [row]);
  assert.deepEqual(client.calls, [
    {
      functionName: "list_pending_price_corrections_for_admin",
      args: { p_limit: 100 },
    },
  ]);
});

test("不正な価格修正レスポンスを拒否する", async () => {
  for (const data of [
    null,
    {},
    [correctionRow({ id: 0 })],
    [correctionRow({ proposed_sale_price: -1 })],
    [correctionRow({ proposed_sale_price: null, proposed_buy_price: null })],
    [correctionRow({ proposed_stock_status: "invalid" })],
    [correctionRow({ proposed_observed_on: "2026-02-29" })],
    [correctionRow({ submitted_at: "invalid" })],
  ]) {
    await assert.rejects(
      loadPendingPriceCorrections(rpcClient({ data, error: null })),
      /invalid_admin_correction_response/,
    );
  }
});

test("価格修正レビューRPCへ入力を正しく渡す", async () => {
  const client = rpcClient({ data: null, error: null });
  await reviewPriceCorrection(client, {
    requestId: 4,
    decision: "rejected",
    reviewNote: "公式情報と一致しない",
  });
  assert.deepEqual(client.calls, [
    {
      functionName: "review_price_correction_for_admin",
      args: {
        p_decision: "rejected",
        p_request_id: 4,
        p_review_note: "公式情報と一致しない",
      },
    },
  ]);
});

test("価格修正RPCエラーを例外として扱う", async () => {
  const error = { code: "42501", message: "denied" };
  await assert.rejects(
    loadPendingPriceCorrections(rpcClient({ data: null, error })),
    /42501/,
  );
  await assert.rejects(
    reviewPriceCorrection(rpcClient({ data: null, error }), {
      requestId: 4,
      decision: "approved",
      reviewNote: "",
    }),
    /42501/,
  );
});
