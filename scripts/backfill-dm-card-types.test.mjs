import assert from "node:assert/strict";
import test from "node:test";

import { aggregateCardTypes } from "./backfill-dm-card-types.mjs";

test("収録版の種類を同名カードへ集約し、複数面も保持する", () => {
  const cards = [
    { name: "通常", official_url: "https://example.test/?id=one" },
    { name: "ツイン", official_url: "https://example.test/?id=twin" },
    { name: "ツイン", official_url: "https://example.test/?id=twin-reprint" },
  ];
  const result = aggregateCardTypes(cards, new Map([
    ["one", new Set(["クリーチャー"])],
    ["twin", new Set(["クリーチャー", "呪文"])],
    ["twin-reprint", new Set(["呪文"])],
  ]));
  assert.deepEqual(result, [
    { name: "ツイン", card_types: ["クリーチャー", "呪文"] },
    { name: "通常", card_types: ["クリーチャー"] },
  ]);
});
