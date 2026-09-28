import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  buildRulesBackfillManifest,
  buildRulesBackfillWorklist,
  completeRuleIds,
  createGracefulStopController,
  officialCardId,
  parseJsonl,
  parseRulesBackfillArguments,
  reconcileFailureRecords,
  runRulesBackfillWorklist,
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

test("resume reconciles a stale manifest from successful JSONL IDs", () => {
  const completedIds = new Set(Array.from({ length: 10_576 }, (_, index) => `dm-test-${index}`));
  const failuresById = new Map(Array.from({ length: 31 }, (_, index) => [`dm-failed-${index}`, {}]));
  const manifest = buildRulesBackfillManifest(23_470, completedIds, failuresById, "2026-09-28T00:00:00.000Z");

  assert.equal(manifest.rules_print_count, 10_576);
  assert.equal(manifest.failure_count, 31);
  assert.equal(manifest.pending_print_count, 12_863);
  assert.equal(manifest.complete, false);
});

test("JSONL repair drops only a malformed trailing partial line", () => {
  const repaired = parseJsonl('{"ok":true}\n{"partial":', "fixture", { repairTrailingPartial: true });
  assert.deepEqual(repaired.records, [{ ok: true }]);
  assert.equal(repaired.repairedTrailingPartial, true);
  assert.equal(repaired.normalizedContent, '{"ok":true}\n');
  assert.throws(() => parseJsonl('{"ok":true}\n{"broken":}\n', "fixture", { repairTrailingPartial: true }), /malformed JSON on line 2/);
});

test("successful JSONL records remain unique and valid during resume", () => {
  const record = {
    name: "カードA",
    official_card_id: "dm-test-001",
    official_url: CARD.official_url,
    races: [],
    card_texts: [""],
  };
  assert.deepEqual([...completeRuleIds([record])], ["dm-test-001"]);
  assert.throws(() => completeRuleIds([record, record]), /Duplicate existing rules record/);
});

test("failure reconciliation deduplicates by ID and removes successful IDs", () => {
  const sourcesById = new Map([
    ["dm-test-001", { ...CARD, official_card_id: "dm-test-001" }],
    ["dm-test-002", { name: "カードB", official_card_id: "dm-test-002", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-002" }],
  ]);
  const record = (id, error, checkedAt) => ({
    name: sourcesById.get(id).name,
    official_card_id: id,
    official_url: sourcesById.get(id).official_url,
    error,
    checked_at: checkedAt,
  });
  const failures = reconcileFailureRecords([
    record("dm-test-001", "fetch failed", "2026-09-27T00:00:00.000Z"),
    record("dm-test-001", "timeout", "2026-09-28T00:00:00.000Z"),
    record("dm-test-002", "HTTP 503", "2026-09-28T00:00:00.000Z"),
  ], new Set(["dm-test-002"]), sourcesById);

  assert.equal(failures.size, 1);
  assert.equal(failures.get("dm-test-001").error, "timeout");
});

test("resume prioritizes unresolved failures and never retries successful IDs", () => {
  const sources = selectPrintSources([
    CARD,
    { name: "カードB", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-002" },
    { name: "カードC", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-003" },
  ]);
  const worklist = buildRulesBackfillWorklist(sources, new Set(["dm-test-002"]), new Map([["dm-test-003", {}]]));
  assert.deepEqual(worklist.map((source) => source.official_card_id), ["dm-test-003", "dm-test-001"]);
});

test("SIGINT finishes the active request and persists success before stopping", async () => {
  const signals = new EventEmitter();
  const controller = createGracefulStopController(signals);
  const source = selectPrintSources([CARD])[0];
  const completedIds = new Set();
  const failuresById = new Map([[source.official_card_id, { error: "timeout" }]]);
  let appends = 0;
  let persists = 0;
  try {
    const result = await runRulesBackfillWorklist({
      worklist: [source, { ...source, official_card_id: "dm-test-002", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm-test-002" }],
      completedIds,
      failuresById,
      fetchRecord: async (card) => {
        signals.emit("SIGINT");
        return { official_card_id: card.official_card_id, official_url: card.official_url };
      },
      appendSuccess: async () => { appends += 1; },
      persist: async () => { persists += 1; },
      shouldStop: controller.shouldStop,
    });

    assert.equal(result.stopReason, "signal");
    assert.equal(result.attempted, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(appends, 1);
    assert.ok(persists >= 2);
    assert.deepEqual([...completedIds], [source.official_card_id]);
    assert.equal(failuresById.has(source.official_card_id), false);
  } finally {
    controller.dispose();
  }
});

test("repeated transport failures stop after the safe consecutive threshold", async () => {
  const sources = selectPrintSources(Array.from({ length: 5 }, (_, index) => ({
    name: `カード${index}`,
    official_url: `https://dm.takaratomy.co.jp/card/detail/?id=dm-test-${index}`,
  })));
  const completedIds = new Set();
  const failuresById = new Map();
  let persists = 0;
  const result = await runRulesBackfillWorklist({
    worklist: sources,
    completedIds,
    failuresById,
    fetchRecord: async () => { throw new Error("fetch failed"); },
    appendSuccess: async () => assert.fail("transport error must not append success"),
    persist: async () => { persists += 1; },
  });

  assert.equal(result.attempted, 3);
  assert.equal(result.stopReason, "consecutive_transport_failures");
  assert.equal(failuresById.size, 3);
  assert.equal(persists, 4);
});
