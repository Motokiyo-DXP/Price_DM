import assert from "node:assert/strict";
import test from "node:test";
import { auditShopRows, validateShopManifest } from "./audit-shop-manifest.mjs";

const manifest = {
  schemaVersion: 1,
  chainName: "チェーンA",
  scope: "営業中の実店舗",
  sourceUrl: "https://example.com/shops",
  verifiedAt: "2026-08-11T00:00:00+09:00",
  stores: [
    {
      sourceStoreId: "tokyo",
      name: "チェーンA 東京店",
      prefecture: "東京都",
      municipality: "千代田区",
      addressLine: "外神田1-1-1",
      operationalStatus: "active",
    },
  ],
};

const completeRow = {
  source_store_id: "tokyo",
  name: "チェーンA 東京店",
  name_kana: "ちぇーんえー とうきょうてん",
  aliases: ["東京店"],
  prefecture: "東京都",
  municipality: "千代田区",
  address_line: "外神田1-1-1",
  website_url: "https://example.com/tokyo",
  chain_name: "チェーンA",
  source_url: "https://example.com/shops",
  source_verified_at: "2026-08-11T00:00:00+09:00",
  operational_status: "active",
};

test("完全一致する店舗マニフェストを合格にする", () => {
  const report = auditShopRows(manifest, [completeRow]);
  assert.equal(report.ok, true);
  assert.equal(report.expectedCount, 1);
  assert.equal(report.databaseCount, 1);
});

test("未登録・余分・情報欠損・差分を失敗として列挙する", () => {
  const report = auditShopRows(manifest, [{
    ...completeRow,
    source_store_id: "extra",
    name: "チェーンA 別店舗",
    name_kana: null,
    aliases: [],
  }]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ["チェーンA 東京店"]);
  assert.deepEqual(report.unexpected, ["チェーンA 別店舗"]);
});

test("マニフェスト内の店舗ID重複を拒否する", () => {
  assert.throws(
    () => validateShopManifest({ ...manifest, stores: [...manifest.stores, { ...manifest.stores[0] }] }),
    /duplicate_source_store_id/,
  );
});
