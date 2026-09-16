# Next Vertical Slice — TAP

Status: **DESIGN READY**. Production implementation is outside this gate.

Design baseline: `main@e05609904771e588a2b9be814c3aae97713773bd` (after PR #11). Rule source: [official Comprehensive Game Rules Ver.1.51, updated 2026-07-23](https://dm.takaratomy.co.jp/img/dm_rule_20260723_5.pdf). Evidence set: `TAP_BASE_2026_09_16` (`data/evidence/tap_base_evidence.json`).

## Selection

DRAW and DISCARD established zone movement. TAP is the smallest independent state mutation: one already-selected card in the actor's mana zone changes from untapped to tapped, without a zone move, randomness, or card-type lookup. The existing UI has an explicit `toggleTap(owner, zone, cardId)` operation. This does not imply that every toggle is semantic TAP.

| Candidate | Design concern | Decision |
| --- | --- | --- |
| TAP | Deterministic state change, no zone move or randomness; explicit UI operation and Production Shadow candidate | **Selected** |
| UNTAP | Existing `keep_tapped` marker handling is convenience policy | Separate slice |
| CHARGE | Generic hand-to-mana move lacks semantic intent and adds mana entry state | Deferred |
| DESTROY | Replacement and GameObject semantics | Deferred |
| SHUFFLE | Randomness, `RandomSource`, and server authority | Deferred |

## Official rules and boundary

- `105.1`: untapped and tapped are orientations of a card.
- `105.4`: orientation cannot be changed arbitrarily.
- `105.4a`: cards in the mana zone may be tapped; battle-zone eligibility is limited by card type. Mana-only scope avoids that type decision.
- `105.6`: an already-tapped card cannot be made tapped again; selecting it for a tap instruction can still occur without a completed state change.
- `701.2`/`701.2a`: TAP is the defined keyword operation, rotating a card 90 degrees from upright.

The Action represents a tap instruction supplied by a caller. It does not grant permission to change orientation at an arbitrary time. Timing, cost payment, and effect authority remain caller responsibilities. This slice proves only the base state transition.

## Proposed Action and state

```ts
type TapAction = Readonly<{
  type: "TAP";
  actor: PlayerId;
  cardInstanceId: string;
  zone: "mana";
  cause: RuleCause;
}>;

type RuleManaCardState<TPayload> = Readonly<{
  card: RuleCard<TPayload>;
  tapped: boolean;
}>;
```

Add `mana: readonly RuleManaCardState<TPayload>[]` to `RulePlayerState` when implementing. A mana entry is a zone-specific state wrapper around the identity-bearing `RuleCard`; preserve its exact `card` identity and array order on TAP. No generic zone enum or zone map is needed.

| Placement | Benefit | Cost / conflict | Decision |
| --- | --- | --- | --- |
| `RuleCard.tapped` | Fewer immediate types | Mixes physical card identity with zone/object orientation and changes DRAW/DISCARD card shape | Rejected |
| Mana-only wrapper | Localizes orientation to mana presence; leaves DRAW/DISCARD contracts alone; small implementation | One additional wrapper and projection | **Selected** |

This is a transitional mana-only model. Future GameObject/ZonePresence work may revise it, but this gate creates neither framework. Deck, hand, and graveyard remain their existing `RuleCard[]` representations.

## Proposed Events and already-tapped result

Successful transition: `TAP_ATTEMPTED` then `CARD_TAPPED`; only the targeted mana entry changes `false -> true`.

For an already-tapped mana card, compare:

| Option | Events | Assessment |
| --- | --- | --- |
| A | `TAP_ATTEMPTED` only | State remains correct, but consumers must infer why no result event followed. |
| B | `TAP_ATTEMPTED`, `TAP_NO_STATE_CHANGE_ALREADY_TAPPED` | Explicit result matches DRAW's attempted-plus-outcome pattern. `FAILED` would wrongly suggest an invalid Action. |

**Choose B** with `TAP_NO_STATE_CHANGE_ALREADY_TAPPED`. It is a Rule result under `105.6`: state is unchanged and `CARD_TAPPED` is absent. `TAP_ATTEMPTED` says the instruction was attempted, not that a tap occurred. DRAW's `DRAW_FAILED_NO_CARD` also records an explicit no-result outcome; this name is more precise because the target is valid and selectable. Event payloads should identify actor, card instance, and fixed `mana` zone. No invented `CARD_TAPPED` or tap trigger is emitted on no change.

An ID absent from the actor's mana zone is instead an internal precondition violation. Validate it before emitting any Rule Event, as DISCARD does for an absent hand ID. Do not conflate this with the already-tapped outcome or invent `TAP_FAILED_CARD_NOT_IN_MANA`.

## Legacy and Production feasibility

`CardView` single tap reaches `handleCardTap`, then `toggleTap(owner, zone, cardId)` when selection, pending move, and Yobinion modes do not intercept it. `toggleTap` rejects deck/hand/shield and otherwise toggles a matching card inline. The `mana` + `tapped === false` branch yields `false -> true`, so its semantic TAP intent is identifiable. The `tapped === true` branch is UNTAP and excluded. Other zones are excluded even though the legacy helper may toggle them.

The marking menu has a separate `toggle_tap` entry point with its own inline mutation. In mana on an untapped card it can also mean TAP. Both entry points need the same semantic mapping before Production Shadow, but their present implementations differ on UNTAP: single tap removes `keep_tapped`, whereas the marking-menu branch only toggles `tapped`. Preserve those distinct legacy behaviors when extracting a narrow helper or helpers.

There is no exported single-card legacy tap helper today. A behavior-preserving extraction is needed before reliable Production Shadow wiring and strict comparison, so the verdict is **`PRODUCTION_SHADOW_FEASIBLE_AFTER_LEGACY_HELPER_EXTRACTION`** (`LIKELY_FEASIBLE` at this Design Gate). The future Shadow target is only one mana card currently untapped. Legacy still returns the Production BoardState; Rule Core remains comparison-only. Test-only Shadow may compare a fixed legacy transition first. No extraction or wiring occurs in this PR.

## Initial implementation and validation plan

1. Pure Core: one untapped mana card changes `false -> true`; preserve `cardInstanceId`, payload, mana order, and every other mana card.
2. Leave actor deck/hand/graveyard, other player, and unrelated state unchanged. Verify input immutability and deterministic repeated resolution.
3. Verify event order `TAP_ATTEMPTED`, `CARD_TAPPED`.
4. For already-tapped mana, verify unchanged state, `TAP_ATTEMPTED` plus `TAP_NO_STATE_CHANGE_ALREADY_TAPPED`, and no `CARD_TAPPED`.
5. For absent ID, verify internal precondition failure and no Rule Events.
6. Test-only Shadow: strict-match targeted Legacy mana tapped state, card identity, other mana cards, other zones, and other player. Include both UI entry points when extracting their seams; verify no Legacy UNTAP behavior changes.
7. Before Production Shadow, test the single-card legacy helper extraction, then compare only mana `false -> true`. Preserve online authority and hidden-information boundaries.

## Deferred

UNTAP; battle-zone TAP; creature/Tamaseed eligibility; stacked/evolution object TAP; attack declaration TAP; mana payment; multiple simultaneous TAP; tap replacement; tap triggers; `keep_tapped` policy; Generic GameObject; Generic ZonePresence. No Generic Zone Map, Relation Graph, CompositionTransition, or generic permanent-state framework is introduced.

`repoMapImpact: NONE` — this PR changes docs, evidence, and progress state only.

`BLOCKED_SPEC: NONE` — the official mana rule, narrow state wrapper, semantic UI `false -> true` path, and future legacy comparison seam are identifiable.
