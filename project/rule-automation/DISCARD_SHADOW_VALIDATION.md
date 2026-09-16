# DISCARD Shadow Validation

Date: 2026-09-16

Baseline main: `b08d29da68ca82a340fa971d20cd3b302222115e`

Rule version: Duel Masters Comprehensive Game Rules Ver.1.51

Evidence set: `DISCARD_BASE_2026_09_16` (`data/evidence/discard_base_evidence.json`)

Pure Rule Core: PASS — one valid, already-selected card

Test-only Shadow: PASS — p1 and p2 `STRICT_MATCH`

Production Shadow feasibility: `PRODUCTION_SHADOW_DEFERRED_NO_SEMANTIC_INTENT`

Validation result: `DISCARD_TEST_SHADOW_VALIDATED`

## Pure Rule Core review

- DISCARD moves the selected card from the actor's hand to the end of that actor's graveyard, retaining the exact `RuleCard` object, its instance ID, and payload.
- The other hand cards keep their order. The actor's deck, the other player's state, and the input graph are unchanged.
- The same state and Action produce the same state and Events. DISCARD uses neither `Math.random()` nor `Date.now()`.
- An absent card ID is an internal precondition failure, not a rule-level failed-discard Event.
- `DISCARD_ATTEMPTED` precedes `CARD_DISCARDED`. Both identify the player, card, hand source, proposed graveyard destination, and DISCARD reason. Only `CARD_DISCARDED` has `finalDestinationZone: "graveyard"`; the Attempt is proposal-only.

## Test-only Legacy Shadow review

- Tests compute the Legacy side with `moveCardsBetweenZones(..., "hand", "graveyard", singleId)` and independently derive the Shadow Board from the Rule Core resolution. The adapter does not call the Legacy move helper.
- Both p1 and p2 strictly match for a middle-hand card with an existing graveyard. Remaining hand order and graveyard append order match.
- The moved card's instance ID and Legacy presentation fields match: `face`, `tapped`, `shieldMarker`, `markers`, `stackId`, `stackOrder`, `stackLayout`, `stackPlacement`, and `attachedToStackId`.
- The other player's BoardState object, acting player's deck, and unrelated notification state remain unchanged in the Shadow result. A deliberate presentation difference produces `MISMATCH`.
- Test-only Shadow has no logging or warning path for hidden card contents. Rule Core does not model viewer-specific visibility.

## Production Shadow feasibility

`PlaytestBoard.moveCard(owner, from, cardId, to, targetCardId?, choice?, individual?)` routes an ordinary move through `commitMove(owner, from, cardId, to, placement, individual)` to `moveCardsBetweenZones`. Neither path carries semantic intent, operation kind, or `reason: "DISCARD"`. The generic move table allows hand-to-graveyard movement. The same arguments and resulting BoardState could therefore represent either a rule-directed DISCARD or a manual zone move.

Verdict: `PRODUCTION_SHADOW_DEFERRED_NO_SEMANTIC_INTENT`. This is an intentional architecture gate, not a validation failure. Do not connect Production Shadow until a real caller provides explicit semantic DISCARD intent. No new intent framework, button, menu, adapter, or UI path was introduced here.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run test:rule` | PASS — 23 tests |
| `npm run typecheck` | PASS |
| `npm run test:playfield` | PASS — 101 tests |
| `npm run build` | PASS; Supabase-not-configured log is non-fatal in this local environment |
| GitHub Actions | PASS — PR #11 run `35073232966` |

The Acceptance Criteria are directly covered by existing Pure DISCARD, DRAW regression, and p1/p2 Shadow tests; no additional test was needed in this validation PR.

## Scope and next decision

No Production code or online boundary changes are included. This result validates only the Pure Rule Core and test-only Shadow, **not** a Production DISCARD path. Production Shadow deferral does not block a separate `AI_DESIGN + HUMAN_GATE` comparison for the next Vertical Slice; none is selected here.

`automationGap: NONE` — existing `npm run test:rule` and PR CI cover the repeatable checks.

`repoMapImpact: NONE`

`BLOCKED_SPEC: NONE`
