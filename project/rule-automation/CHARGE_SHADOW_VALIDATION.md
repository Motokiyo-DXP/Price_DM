# CHARGE Pure Core and test-only Shadow validation

Date: 2026-10-22. Baseline: `price-dm/main@6ad0f252c6564af7727252c9edbe40637f80f09c`.
Branch: `codex/charge-core-shadow`. Evidence: `CHARGE_BASE_2026_09_16`.

## Scope and result

CHARGE moves one selected actor hand card to actor mana tail with the same RuleCard reference.
Rule-side canonical characteristics determine entry tap state, independently of payload.
Single civilization and explicit `zero` enter untapped; multiple distinct colors enter tapped.
Missing, empty, unknown, or mixed zero/color metadata fails before events. Empty Legacy metadata
cannot certify colorlessness; the adapter requires explicit `zero` and rejects partially unknown lists.
The canonical deck loader supplies civilizations to the Legacy board builder; missing fallback
values can be empty, so this test seam explicitly gates the selected card rather than trusting every board card.
No DB inspection or mutation was needed to validate this boundary.

Success emits CHARGE_ATTEMPTED then CARD_CHARGED; only the result has finalDestinationZone and entryTapped.
Invalid actor hand IDs throw before resolution returns events.

## Deterministic evidence

- CHARGE Core: 15 tests, including both players, single/multicolor/zero, frozen-input immutability,
  repeated deterministic resolution, exact events, identity, hand/mana order, zone/player isolation,
  missing/invalid metadata and wrong-zone/opponent IDs.
- CHARGE test-only Shadow: 14 tests. Eight valid cases require STRICT_MATCH against independent
  moveCardsBetweenZones results, including normalization/deduplication and partial-stack presentation.
  Each valid case detects deliberately changed mana tap state, hand order, and other-player deck as MISMATCH.
  Six rejection cases cover missing/unknown metadata and absent hand identity.
- npm run test:rule: 67 passed, 0 failed (29 new CHARGE tests).
- npm run test:playfield: 166 passed, 0 failed.
- CI-required checks: test:db-safety 8/8, test:shopping-sharing 12/12,
  test:rule-source 9/9, deck-share-image-layout 2/2; no skipped tests.
- npm run typecheck and npm run build: passed. Build retains existing CSS autoprefixer warnings.
- Total executed test cases: 264 passed, 0 failed.

The initial typecheck found an inferred intersection in the comparator's computed player projection;
explicit per-player projection resolved it. Final checks passed after the fix.

## Authority and next gate

No Legacy helper, UI, online authority, DB, migration, or deployment changes.
Only tests import adapters/charge-test-shadow.ts. The Pure Core has no Legacy runtime dependency.
Production Shadow remains DEFERRED_NO_SEMANTIC_INTENT. Generic manual hand-to-mana movement
cannot establish CHARGE intent or caller permissions. Recommend keeping Production disconnected
until a separately approved explicit semantic caller and reliable canonical metadata boundary exist.
No next-stage implementation is included. BLOCKED_SPEC: NONE for this test-only scope.

repoMapImpact: UPDATE_REQUIRED (updated REPO_MAP.md for CHARGE contracts, primitive, tests, and test seam).
