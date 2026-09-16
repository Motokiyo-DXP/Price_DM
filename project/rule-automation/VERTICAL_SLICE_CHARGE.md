# Next Vertical Slice — CHARGE

Status: **DESIGN READY**. R12 starts at `main@fd3b82f44e7229e1adfddfd0d70b651bf93e5fd6` after TAP PR #16. This gate changes documentation and evidence only. Evidence set: `CHARGE_BASE_2026_09_16` in [`data/evidence/charge_base_evidence.json`](./data/evidence/charge_base_evidence.json). Source: [official Comprehensive Game Rules Ver.1.51, 2026-07-23](https://dm.takaratomy.co.jp/img/dm_rule_20260723_5.pdf).

## Selection

| Candidate | Assessment |
| --- | --- |
| **CHARGE — selected** | Combines DISCARD's hand move semantics with TAP's mana wrapper, proves entry state derivation, and directly supports basic game progress without randomness or GameObject modeling. |
| UNTAP | Near inverse of TAP; adds little Core capability while `keep_tapped` policy needs separation. |
| SHUFFLE | Introduces `RandomSource` and authority decisions together. |
| DESTROY | Requires replacement and battle object semantics too early. |

## Official rule and boundary

- `503.1`: the turn player may place one card from hand into mana during the charge step; declining is allowed.
- `503.2`: normally one charge in that step; continuous effects can alter the limit.
- `701.8`/`701.8a`: CHARGE is the hand-to-that-player's-mana operation, with upside-down placement.
- `405.1`: mana cards are upside down; multicolor cards enter tapped.

The caller supplies a valid, already-selected card and owns turn/step permission and charge count. The Core resolves the single CHARGE operation. Its Action has no `turn`, `step`, or `remainingChargeCount`.

```ts
type ChargeAction = Readonly<{
  type: "CHARGE";
  actor: PlayerId;
  cardInstanceId: string;
  cause: RuleCause;
}>;
```

## Civilization metadata gate — decided

Choose a minimal Rule-side projection of card-definition characteristics, attached to the identity-bearing `RuleCard`, for example `characteristics: Readonly<{ civilizations: readonly Civilization[] }>`. `Civilization` is a Rule-owned canonical vocabulary (`light`, `water`, `darkness`, `fire`, `nature`, `zero`); the adapter maps the current `CardInstance.civilizations` into that vocabulary using the existing normalization semantics (`resolveCardCivilizations`: trim, lowercase, recognized values, distinct values). A Rule-only fixture can provide the same characteristics independently of Legacy UI. Preserve the **same `RuleCard` object** during the move, including its projected characteristics and payload. This is a minimum property, not a Card Definition framework.

| Source | Assessment |
| --- | --- |
| Core reads `CardInstance.civilizations` through `payload` | Deterministic for current boards but couples Pure Core to the Legacy UI type and optional metadata; reject. |
| Rule-side canonical characteristics projected once from the official card record / existing canonical metadata | Deterministic for the same card identity, keeps Core independent of Legacy, and can later be sourced from Effect IR / Card Definition; **choose**. |
| Action or environment supplies `isMulticolor` / civilizations | Allows caller-derived inconsistency for the same card identity; reject for base CHARGE. |

The current board builder sets `CardInstance.civilizations` from canonical deck-card metadata via `resolveCardCivilizations`; `isMulticolorCard` counts distinct normalized recognized values. The adapter must project that card-definition value, not infer it from name, face, tapped, UI orientation, or Action. Missing/unresolvable civilization metadata must fail projection for CHARGE instead of silently treating a potentially multicolor card as single-color. Zero civilization is a valid explicit empty/zero characteristic when confirmed from its card definition. This gate assumes the canonical metadata is present and validated for cards admitted to CHARGE; the later implementation must test that boundary. If it cannot ensure this from the actual card source, implementation is `BLOCKED_SPEC` pending a reliable card-definition source.

Base derivation: one recognized civilization (or a verified colorless/zero definition) enters untapped (`false`); two or more distinct official civilizations enter tapped (`true`). Special characteristic changes are outside scope.

## RuleState and identity

Keep `deck`, `hand`, and `graveyard` as `RuleCard[]` and `mana` as `RuleManaCardState[]`. Find the ID only in the actor's hand, remove that one element while retaining the relative order of all other hand cards, and append `{ card: originalHandRuleCard, tapped: derivedEntryState }` to actor mana. Thus `manaEntry.card === originalHandRuleCard`. Do not regenerate identity, mutate payload, replace other mana entries, or introduce a generic zone map. An ID absent from the actor's hand is an internal precondition violation before any Rule Event; there is no `CHARGE_FAILED_CARD_NOT_IN_HAND` event.

## Events and move semantics

Emit `CHARGE_ATTEMPTED`, then `CARD_CHARGED` for a valid base move. Attempt contains `player`, `cardInstanceId`, `sourceZone: "hand"`, `proposedDestinationZone: "mana"`, `reason: "CHARGE"`. Result carries the same fields plus `finalDestinationZone: "mana"` and `entryTapped: boolean`. Attempt has **no** final destination. `cause` remains on the Action; the event's reason identifies the semantic move. Replacement/trigger outcomes are deferred; no invented event is emitted for them now.

## Legacy and presentation findings

`moveCardsBetweenZones(current, owner, "hand", "mana", ids)` in `lib/playfield-board.ts` is a generic manual zone move. It filters selected cards in source order, clones each `CardInstance`, sets `face: "face_up"`, `tapped: isMulticolorCard(card)`, `shieldMarker: null`, `markers: []`, and `attachedToStackId: null`. It preserves stack ID/order/layout/placement only for a complete moving stack, otherwise clears them. The default `placement: "bottom"` appends moved cards after existing mana in source order; `"top"` prepends. Source hand survivors retain order, except pre-existing singleton stack metadata may be cleared. These presentation/stack changes belong to Legacy normalization, not RuleCard identity mutation.

Existing `lib/playfield-board.test.mjs` asserts normalized distinct civilizations and hand→mana **multicolor tapped / single-color untapped**. It also tests complete-stack preservation. The board has `tapped` and `face` fields but no 180-degree orientation field. `app/globals.css` renders `.rough-battle-board .zone-mana .play-card` at 180 degrees and its `.tapped` variant at 90 degrees. Upside-down mana presentation is zone CSS; tap is the separate boolean. No generic orientation model is needed.

`components/playtest-board.tsx` routes generic `onMove`/`moveCard` through `moveCardsBetweenZones` for hand→mana, along with other source/destination combinations. Neither the helper signature nor this route carries semantic CHARGE intent or charge-step/count evidence. Verdict: **DEFERRED_NO_SEMANTIC_INTENT** for Production Shadow. Do not add a CHARGE UI button for this gate. A later explicit semantic caller can reopen Production feasibility.

## Implementation and verification plan

1. Pure Core: p1 and p2 single-color and multicolor cases; exactly one hand removal; same `RuleCard` reference at mana tail; single enters untapped and multicolor tapped. Check hand and existing mana order, other player, deck/graveyard, input immutability, and deterministic repeated resolution.
2. Check event order and exact Attempt/Result move fields, especially absence of final destination on Attempt. Invalid hand ID throws before Rule Events.
3. Test-only Shadow: project Legacy hand card characteristics, resolve Pure CHARGE, compare with independent `moveCardsBetweenZones` result for p1 single-color, p1 multicolor, p2 single-color, p2 multicolor. Require `STRICT_MATCH` after presentation normalization of face, tapped, markers, shield marker, and stack fields; verify identity, hand order, mana append order, and other-state isolation. Deliberately alter one comparator value and require `MISMATCH`.
4. Production feasibility is checked after test-only Shadow. Add Production Shadow only if semantic intent can be supplied without changing manual-move behavior; then validate.

## Deferred and gate result

Deferred: mana charge step enforcement; once-per-turn count; extra-charge continuous effects; charge prevention; replacement; triggers; Space Charge; mana entries from deck, graveyard, or battle; face-down mana; special characteristic changes; Turn Model; Decision Model; Generic Move Engine; Generic ZonePresence; Generic Card Definition framework.

`repoMapImpact: NONE` — docs/evidence only.

`BLOCKED_SPEC: NONE` for the design gate. Implementation must stop with `BLOCKED_SPEC` if the Rule-side multicolor source cannot be validated, Legacy entry state contradicts the official rule, a generic Card Definition framework proves necessary, the mana wrapper cannot express entry state, or official evidence becomes materially ambiguous.
