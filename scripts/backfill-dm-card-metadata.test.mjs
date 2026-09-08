import assert from "node:assert/strict";
import test from "node:test";

import { parseBackfillArguments, selectCanonicalSources } from "./backfill-dm-card-metadata.mjs";

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
