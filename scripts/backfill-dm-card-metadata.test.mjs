import assert from "node:assert/strict";
import test from "node:test";

import {
  createMetadataRecord,
  isMetadataRecordComplete,
  parseBackfillArguments,
  selectCanonicalSources,
} from "./backfill-dm-card-metadata.mjs";

test("backfill arguments preserve the official-site delay floor", () => {
  assert.deepEqual(parseBackfillArguments([]), { concurrency: 4, delayMs: 750, limit: null });
  assert.throws(() => parseBackfillArguments(["--delay-ms=749"]), /cannot be lower/);
});

test("one official print is selected per unfinished canonical card", () => {
  const cards = [
    { name: "カードA", official_url: "https://example.com/a1" },
    { name: "カードA", official_url: "https://example.com/a2" },
    { name: "カードB", official_url: "https://example.com/b1" },
  ];
  assert.deepEqual(selectCanonicalSources(cards, new Set(["カードB"])), [
    { name: "カードA", officialUrls: ["https://example.com/a1", "https://example.com/a2"] },
  ]);
});

test("only metadata with all new printed fields counts as backfilled", () => {
  const record = {
    name: "基礎情報カード",
    cost: null,
    cost_is_infinite: true,
    civilizations: ["zero"],
    card_types: ["クリーチャー"],
    power_text: "∞",
    power_value: null,
  };
  assert.equal(isMetadataRecordComplete(record), true);
  assert.equal(isMetadataRecordComplete({ name: "旧形式", cost: null, civilizations: [] }), false);
  assert.deepEqual(createMetadataRecord("基礎情報カード", record, "https://example.com/card"), {
    ...record,
    official_url: "https://example.com/card",
  });
});
