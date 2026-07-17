import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAliasRecord,
  parseSearchConfig,
} from "./fetch-dm-card-aliases.mjs";

test("public search configuration is discovered without storing its credential", () => {
  assert.deepEqual(
    parseSearchConfig(
      'ELASTIC_SEARCH_ENDPOINT:"https://search.example",ELASTIC_SEARCH_CREDENTIAL:"public-key"',
    ),
    { endpoint: "https://search.example", credential: "public-key" },
  );
});

test("only explicit alternate readings are collected and deduplicated", () => {
  const aliases = new Map();
  mergeAliasRecord(aliases, {
    name: "理想と平和の決断",
    name_ruby: "パーフェクト・アルカディア",
  });
  mergeAliasRecord(aliases, {
    name: "理想と平和の決断",
    name_ruby: "パーフェクト・アルカディア",
  });
  mergeAliasRecord(aliases, { name: "通常名", name_ruby: null });

  assert.deepEqual([...aliases.get("理想と平和の決断")], [
    "パーフェクト・アルカディア",
  ]);
  assert.equal(aliases.has("通常名"), false);
});

