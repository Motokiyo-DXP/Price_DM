import assert from "node:assert/strict";
import test from "node:test";
import { buildMetadataUpdateSql, normalizeMetadataRecords } from "./build-dm-card-metadata-update.mjs";

test("deduplicates metadata and preserves infinity and printed power fields", () => {
  const records = normalizeMetadataRecords([
    { name: "無限カード", cost: null, cost_is_infinite: true, civilizations: ["zero"], card_types: ["クリーチャー"], power_text: "∞", power_value: null },
    { name: "通常カード", cost: 3, cost_is_infinite: false, civilizations: ["water"], card_types: ["クリーチャー"], power_text: "5000", power_value: 5000 },
    { name: "通常カード", cost: 4, cost_is_infinite: false, civilizations: ["water", "light"], card_types: ["クリーチャー"], power_text: "0000+", power_value: 0 },
  ]);
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.name === "通常カード").cost, 4);
  assert.equal(records.find((record) => record.name === "無限カード").cost_is_infinite, true);
  const sql = buildMetadataUpdateSql(records);
  assert.match(sql, /null, true/);
  assert.match(sql, /'∞', null/);
  assert.match(sql, /'0000\+', 0/);
  assert.match(sql, /cost_is_infinite boolean not null/);
  assert.match(sql, /power_value integer/);
  assert.match(buildMetadataUpdateSql(records), /Expected to update/);
  assert.match(sql, /metadata_synced_at=pg_catalog\.now\(\)/);
});

test("公式表記が空の無文明カードを保持し、欠損と不正値だけを拒否する", () => {
  assert.deepEqual(
    normalizeMetadataRecords([{ name: "無文明", cost: 5, cost_is_infinite: false, civilizations: [], card_types: ["呪文"], power_text: null, power_value: null }]),
    [{ name: "無文明", cost: 5, cost_is_infinite: false, civilizations: [], card_types: ["呪文"], power_text: null, power_value: null }],
  );
  assert.throws(() => normalizeMetadataRecords([{ name: "不足", cost: 1, cost_is_infinite: false }]), /Invalid civilizations/);
  assert.throws(() => normalizeMetadataRecords([{ name: "不正", cost: 1, cost_is_infinite: false, civilizations: ["unknown"], card_types: [], power_text: null, power_value: null }]), /Invalid civilizations/);
  assert.throws(() => normalizeMetadataRecords([{ name: "矛盾", cost: 7, cost_is_infinite: true, civilizations: [], card_types: [], power_text: null, power_value: null }]), /Invalid infinite cost/);
  assert.throws(() => normalizeMetadataRecords([{ name: "不正パワー", cost: null, cost_is_infinite: false, civilizations: [], card_types: [], power_text: null, power_value: 1000 }]), /Inconsistent printed power/);
  assert.throws(() => normalizeMetadataRecords([{ name: "未知表記", cost: 1, cost_is_infinite: false, civilizations: [], card_types: [], power_text: "3000+", power_value: 3000 }]), /Inconsistent printed power/);
});
