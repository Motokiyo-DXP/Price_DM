import assert from "node:assert/strict";
import test from "node:test";

import {
  officialCardId,
  parseRulesBackfillArguments,
  selectPrintSources,
} from "./backfill-dm-card-rules.mjs";

const CARD = {
  name: "カードA",
  official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-001",
};

test("rules backfill keeps one source per official print and skips completed IDs", () => {
  const cards = [CARD, { name: "カードA", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-002" }];
  assert.deepEqual(selectPrintSources(cards, new Set(["dm-test-001"])), [
    { name: "カードA", official_card_id: "dm-test-002", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-002" },
  ]);
  assert.equal(officialCardId("https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-003"), "dm34+1s-003");
  assert.throws(() => selectPrintSources([CARD, CARD]), /Duplicate source record/);
});

test("rules backfill fails explicitly on missing or conflicting official print identity", () => {
  assert.throws(() => selectPrintSources([{ name: "IDなし" }]), /no official URL/);
  assert.throws(() => selectPrintSources([{ ...CARD, official_card_id: "wrong" }]), /does not match URL/);
  assert.throws(() => selectPrintSources([
    CARD,
    { name: "別カード", official_url: CARD.official_url },
  ]), /Conflicting source records/);
});

test("rules backfill arguments enforce the minimum request delay", () => {
  assert.deepEqual(parseRulesBackfillArguments([]), { delayMs: 1_000, limit: null });
  assert.throws(() => parseRulesBackfillArguments(["--delay-ms=749"]), /cannot be lower/);
  assert.deepEqual(parseRulesBackfillArguments(["--limit=2"]), { delayMs: 1_000, limit: 2 });
});
