import assert from "node:assert/strict";
import test from "node:test";

import { parseFullImportArguments } from "./import-dm-cards-full.mjs";
import { buildCardSearchMetadata } from "./lib/dm-card-readings.mjs";

test("full import arguments enforce a respectful delay", () => {
  assert.deepEqual(parseFullImportArguments([]), {
    delayMs: 1_000,
    maxPages: null,
    startPage: null,
  });
  assert.throws(() => parseFullImportArguments(["--delay-ms=200"]), /cannot be lower/);
});

test("Japanese readings and verified alternate names are generated", async () => {
  const musha = await buildCardSearchMetadata("ボルメテウス・武者・ドラゴン");
  assert.equal(musha.name_kana, "ボルメテウス・ムシャ・ドラゴン");

  const perfect = await buildCardSearchMetadata("理想と平和の決断");
  assert.deepEqual(perfect.aliases, ["パーフェクト・アルカディア"]);
  assert.deepEqual(perfect.aliases_kana, ["パーフェクト・アルカディア"]);
});

