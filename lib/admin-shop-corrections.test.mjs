import assert from "node:assert/strict";
import test from "node:test";
import { loadPendingShopCorrections, reviewShopCorrection } from "./admin-shop-corrections.ts";

const row = {
  id: 1, shop_id: 2, original_name: "旧店舗名", original_name_kana: null,
  original_aliases: [], original_prefecture: "東京都", original_municipality: null,
  original_address_line: null, original_website_url: null, proposed_name: "新店舗名",
  proposed_name_kana: null, proposed_aliases: null, proposed_prefecture: null,
  proposed_municipality: null, proposed_address_line: null, proposed_website_url: null,
  reason: "名称変更", submitted_at: "2026-07-23T00:00:00.000Z",
};

test("管理者向け店舗修正依頼を検証して返す", async () => {
  const client = { rpc: async () => ({ data: [row], error: null }) };
  assert.deepEqual(await loadPendingShopCorrections(client), [row]);
});

test("不正な管理者向け応答を拒否する", async () => {
  const client = { rpc: async () => ({ data: [{ ...row, shop_id: "2" }], error: null }) };
  await assert.rejects(loadPendingShopCorrections(client), /invalid_admin_shop_correction_response/);
});

test("審査RPCへ入力を渡す", async () => {
  let call;
  const client = { rpc: async (name, args) => { call = { name, args }; return { data: null, error: null }; } };
  await reviewShopCorrection(client, { requestId: 3, decision: "approved", reviewNote: "確認済み" });
  assert.deepEqual(call, {
    name: "review_shop_correction_for_admin",
    args: { p_request_id: 3, p_decision: "approved", p_review_note: "確認済み" },
  });
});
