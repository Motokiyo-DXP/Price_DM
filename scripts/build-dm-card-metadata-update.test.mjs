import assert from "node:assert/strict";
import test from "node:test";
import { buildMetadataUpdateSql, normalizeMetadataRecords } from "./build-dm-card-metadata-update.mjs";

test("deduplicates metadata and preserves a legitimate null cost", () => {
  const records = normalizeMetadataRecords([
    { name: "無限カード", cost: null, civilizations: ["zero"] },
    { name: "通常カード", cost: 3, civilizations: ["water"] },
    { name: "通常カード", cost: 4, civilizations: ["water", "light"] },
  ]);
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.name === "通常カード").cost, 4);
  assert.match(buildMetadataUpdateSql(records), /null/);
  assert.match(buildMetadataUpdateSql(records), /Expected to update/);
  assert.match(buildMetadataUpdateSql(records), /metadata_synced_at=pg_catalog\.now\(\)/);
});

test("公式表記が空の無文明カードを保持し、欠損と不正値だけを拒否する", () => {
  assert.deepEqual(
    normalizeMetadataRecords([{ name: "無文明", cost: 5, civilizations: [] }]),
    [{ name: "無文明", cost: 5, civilizations: [] }],
  );
  assert.throws(() => normalizeMetadataRecords([{ name: "不足", cost: 1 }]), /Invalid civilizations/);
  assert.throws(() => normalizeMetadataRecords([{ name: "不正", cost: 1, civilizations: ["unknown"] }]), /Invalid civilizations/);
});
