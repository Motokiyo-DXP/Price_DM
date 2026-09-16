# TAP Shadow Validation

Date: 2026-09-16

Baseline main: `c7540c935b907cdb59794ce54606cb8a3453a7a5` (after PR #15)

Rule version: [Duel Masters Comprehensive Game Rules Ver.1.51, 2026-07-23](https://dm.takaratomy.co.jp/img/dm_rule_20260723_5.pdf)

Evidence set: `TAP_BASE_2026_09_16` (`data/evidence/tap_base_evidence.json`), claims `TAP-001`, `TAP-002`, `TAP-003`

Validation result: `TAP_PRODUCTION_SHADOW_VALIDATED` for one existing, untapped card in the actor's mana zone, changing `false -> true` through an explicit single-card UI TAP.

## Pure Rule Core

`tap.test.mjs` verifies `TAP_ATTEMPTED` followed by `CARD_TAPPED`, the exact RuleCard identity, mana order, other mana entries, deck, hand, graveyard, other player, input immutability, and deterministic result. The result is `RESOLVED`.

For an already-tapped card, the Pure Core returns unchanged state, `RESOLVED`, and `TAP_ATTEMPTED` followed by `TAP_NO_STATE_CHANGE_ALREADY_TAPPED`, without `CARD_TAPPED`. This is a Pure Core rule result, separate from the Production UI's UNTAP path. A missing mana ID throws an internal precondition `RangeError` before any Rule Event is returned.

## Test-only Shadow

`tap-shadow.test.mjs` compares the independently written Legacy baseline with `projectLegacyBoardForTap -> resolveRuleAction -> applyTapResolutionToLegacyBoard`. Both p1 and p2 return `STRICT_MATCH`. The baseline does not call the Rule primitive or adapter. A changed tap orientation or presentation field returns `MISMATCH`. Already-tapped TAP is outside this test-only Legacy comparison.

## Legacy helper

`playfield-board.test.mjs` verifies that `toggleLegacyCardTapState` produces the same `false -> true` board for both `clearKeepTappedOnUntap` policies. On `true -> false`, normal tap policy (`true`) removes `keep_tapped`, while marking-menu policy (`false`) retains it. Other markers, card fields, surrounding references, and the input board remain intact. A missing target returns the original BoardState.

## Production Shadow

`toggleCardTapWithProductionShadow` selects Shadow only when `zone === "mana"`, the target exists, and `tapped === false`. Already-tapped mana, battle and other zones, and missing targets use the Legacy helper directly. The normal card-tap path and marking-menu `toggle_tap` path both call this routing helper; their respective UNTAP policies remain `true` and `false`.

`runTapProductionShadow` calls `toggleLegacyCardTapState` first. It projects the original board, resolves a `TAP` action with `cause: MANUAL`, applies the Rule resolution to a separate Shadow board, and compares that board with Legacy. It always returns the Legacy board as the Production result. The Rule state never becomes Production authority.

`tap-production-shadow.test.mjs` verifies p1 and p2 `STRICT_MATCH` with both policy values, and equality of the returned board to the Legacy result. The Legacy helper changes only the target's `tapped` value, preserving `instanceId`, `canonicalCardId`, `name`, `face`, `markers`, `shieldMarker`, stack fields, other mana cards, all other zones, the other player, and Board metadata. A `MISMATCH` only warns and still returns Legacy. A Shadow exception yields `UNDETERMINED` and Legacy. Logger failure does not fail TAP. Warning details contain only `player` and `status`; card contents and exception messages are not logged.

## Hidden information and Online boundary

The TAP comparator projects mana card orientation and presentation fields; warning details contain no card identity or hidden contents. PR #15 changed neither `components/online-match-board.tsx` nor RPC, Realtime, `state_version`, hidden-state redaction/hydration, history, or undo/redo code. `PlaytestBoard` commits only the Legacy-derived BoardState returned by the routing helper.

## Automated validation

| Check | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run test:rule` | PASS — 38 tests, including DRAW and DISCARD regression |
| `npm run test:playfield` | PASS — 104 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| PR GitHub Actions | PASS — PR #16 run `35079481508` (initial validation commit) |

One assertion was added to the existing Production Shadow test to verify the exact `MISMATCH` warning payload. No Production code changed.

## Runtime smoke

No reusable authenticated Playtest board fixture is available. Automated runtime smoke was not performed; no new E2E framework was introduced. `humanSmokeRequired: YES`.

Human smoke steps:

1. Open the solo play page with a playable deck.
2. Tap one untapped mana card through the normal card action.
3. Confirm it rotates 90 degrees as before.
4. Confirm the console has no `[rule-shadow][TAP]` warning.
5. Operate the same card again and confirm UNTAP still works.
6. Confirm the existing `keep_tapped` marker behavior.
7. TAP another untapped mana card through the Marking Menu.
8. Confirm the card taps with no `[rule-shadow][TAP]` warning.
9. Confirm a battle-zone card and another non-mana zone still operate as before.

`automationGap: reusable authenticated Playtest runtime smoke fixture` — known gap.

## Deferred scope

UNTAP, battle-zone TAP, attack declaration TAP, mana payment, multiple-card TAP, replacement, trigger, `keep_tapped` rule semantics, generic GameObject, and generic ZonePresence remain unvalidated. The next Vertical Slice is not selected here.

`repoMapImpact: NONE` — validation tests and documentation do not change module responsibilities.

`BLOCKED_SPEC: NONE`
