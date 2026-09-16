# DRAW Shadow Validation

Date: 2026-09-16

Baseline main: `fec9564dc5aa254364d6c1196a621e297993527b`

Rule version: Duel Masters Rule Automation v5

Evidence set: `DRAW_BASE_2026_09_16` (`project/rule-automation/data/evidence/draw_base_evidence.json`)

Production authority: Legacy `drawRandomCard`; Rule Core is comparison-only

Validation result: `DRAW_SHADOW_VALIDATED`

## DRAW Evidence

The evidence set covers normal DRAW, repeated single-card DRAW semantics, non-DRAW deck-to-hand movement, deferred replacement/trigger handling, and empty-deck attempts. This validation does not expand those semantics.

## Pure Rule Core tests

- Normal DRAW moves the deck's first card instance to hand, preserves the remaining order, and emits `DRAW_ATTEMPTED` then `CARD_DRAWN`.
- Multiple DRAW resolves ordered one-card attempts.
- Empty deck emits `DRAW_ATTEMPTED` then `DRAW_FAILED_NO_CARD` without moving a card.
- Input mutation, nondeterministic output, and p1-to-p2 state leakage are covered.
- `Math.random` and `Date.now` are not used under `lib/rule-engine`.

## Test-only Shadow tests

The projected Rule Core result strictly matches Legacy DRAW for the relevant deck and hand projection, including card instance identity and Legacy hand normalization.

## Production Shadow tests

- Legacy BoardState is the returned Production result and Rule Core is comparison-only.
- Normal p1, normal p2, empty-deck, and two sequential Production DRAWs return `STRICT_MATCH`.
- The other player, unrelated zones, and board metadata remain unchanged.
- Shadow mismatch, Shadow exception, and logger failure cannot prevent Legacy DRAW.
- Warning payloads contain only player and status; exception text and hidden card data are excluded.

## Automated validation

| Check | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run test:rule` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:playfield` | PASS |
| `npm run build` | PASS |
| Minimal CI / GitHub Actions | PENDING PR |

The local build completed with existing Autoprefixer compatibility warnings and a non-fatal Supabase-not-configured message during static generation.

## Hidden-information review

Production Shadow compares only card instance IDs and Legacy visibility fields for the acting player's deck/hand projection. Warnings contain no card name, card identity, deck contents, or hand contents. No viewer-specific redaction or hidden-state boundary code changed in this validation.

## Online authority review

`OnlineMatchBoard`, `state_version`, RPC, Realtime, redaction, hydration, Undo/Redo, history, server shuffle, Yobinion, and inspection were not changed. `PlaytestBoard` continues to commit the Legacy BoardState returned by `runDrawProductionShadow`; the Shadow result has no authority.

## Runtime smoke

No existing automated browser/E2E fixture can establish a playable deck state without authenticated/user data. `humanSmokeRequired: YES`.

Manual smoke steps:

1. Open a solo play board with a deck containing at least one card.
2. Record the top deck count, then perform one DRAW.
3. Confirm the same top card enters hand, deck count decreases by one, and existing UI behavior is unchanged.
4. Confirm the browser console has no `[rule-shadow][DRAW]` warning.

## Deferred scope

The following remain intentionally deferred and are not validation failures:

- draw replacement
- draw-trigger processing
- deck-empty win/loss stabilization
- progressive optional draws
- simultaneous multi-player draws
- client prediction

## Known limitations

- Runtime smoke remains a human check because there is no reusable authenticated play-board fixture.
- Production Shadow validates one-card Production actions; multi-card Rule Core semantics are covered directly in Pure Rule Core tests.

## Automation First review

`automationGap: runtime smoke lacks a reusable authenticated play-board fixture.` No new automation framework was introduced in this validation.

`repoMapImpact: NONE`

## Final result

`DRAW_SHADOW_VALIDATED`

The DRAW Vertical Slice is validated from Pure Rule Core through test-only Shadow, Production Shadow, and local CI-equivalent checks. Selection of the next Vertical Slice may proceed after PR CI succeeds.
