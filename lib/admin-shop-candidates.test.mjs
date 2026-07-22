import assert from "node:assert/strict";
import test from "node:test";
import {
  deletePendingShopCandidate,
  loadPendingShopCandidates,
  reviewShopCandidate,
} from "./admin-shop-candidates.ts";

test("保留中候補削除RPCへ候補IDを渡し削除名を返す", async () => {
  const client = rpcClient({ data: "カードショップ秋葉原", error: null });
  assert.equal(await deletePendingShopCandidate(client, 3), "カードショップ秋葉原");
  assert.deepEqual(client.calls, [
    {
      functionName: "delete_pending_shop_candidate_for_admin",
      args: { p_candidate_id: 3 },
    },
  ]);
});

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

function candidateRow(overrides = {}) {
  return {
    id: 3,
    name: "カードショップ例",
    prefecture: "東京都",
    municipality: null,
    address_line: null,
    website_url: "https://example.com",
    submission_count: 2,
    submitted_at: "2026-07-19T10:00:00Z",
    last_submitted_at: "2026-07-20T10:00:00Z",
    ...overrides,
  };
}

test("店舗候補一覧RPCを呼び出してレスポンスを画面用に変換する", async () => {
  const client = rpcClient({ data: [candidateRow()], error: null });
  assert.deepEqual(await loadPendingShopCandidates(client), [
    {
      id: 3,
      name: "カードショップ例",
      prefecture: "東京都",
      municipality: null,
      addressLine: null,
      websiteUrl: "https://example.com",
      submissionCount: 2,
      submittedAt: "2026-07-19T10:00:00Z",
      lastSubmittedAt: "2026-07-20T10:00:00Z",
    },
  ]);
  assert.deepEqual(client.calls, [
    {
      functionName: "list_pending_shop_candidates_for_admin",
      args: { p_limit: 100 },
    },
  ]);
});

test("不正な店舗候補レスポンスを拒否する", async () => {
  for (const data of [
    null,
    {},
    [candidateRow({ id: 0 })],
    [candidateRow({ submission_count: 1.5 })],
    [candidateRow({ prefecture: 13 })],
  ]) {
    await assert.rejects(
      loadPendingShopCandidates(rpcClient({ data, error: null })),
      /invalid_admin_candidate_response/,
    );
  }
});

test("店舗候補レビューRPCへ入力を正しく渡す", async () => {
  const client = rpcClient({ data: [{ candidate_id: 3 }], error: null });
  await reviewShopCandidate(client, {
    candidateId: 3,
    decision: "approved",
    reviewNote: "公式サイト確認済み",
  });
  assert.deepEqual(client.calls, [
    {
      functionName: "review_shop_candidate_for_admin",
      args: {
        p_candidate_id: 3,
        p_decision: "approved",
        p_review_note: "公式サイト確認済み",
      },
    },
  ]);
});

test("RPCエラーと不正なレビュー応答を例外として扱う", async () => {
  await assert.rejects(
    loadPendingShopCandidates(
      rpcClient({ data: null, error: { code: "42501", message: "denied" } }),
    ),
    /42501/,
  );
  await assert.rejects(
    reviewShopCandidate(rpcClient({ data: [], error: null }), {
      candidateId: 3,
      decision: "rejected",
      reviewNote: "",
    }),
    /invalid_admin_review_response/,
  );
  await assert.rejects(
    deletePendingShopCandidate(
      rpcClient({ data: null, error: { code: "P0001", message: "shop_candidate_not_pending" } }),
      3,
    ),
    /shop_candidate_not_pending/,
  );
  await assert.rejects(
    deletePendingShopCandidate(rpcClient({ data: null, error: null }), 3),
    /invalid_admin_candidate_deletion_response/,
  );
});
