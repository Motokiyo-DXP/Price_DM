# Next Vertical Slice — DISCARD

Status: TEST SHADOW VALIDATED / PRODUCTION SHADOW DEFERRED

Pure Core: COMPLETE. Test-only Shadow: VALIDATED. Production Shadow: DEFERRED — no explicit semantic DISCARD intent in the existing UI path. See [`DISCARD_SHADOW_VALIDATION.md`](./DISCARD_SHADOW_VALIDATION.md). This slice is not production-validated.

Rule version: Duel Masters Comprehensive Game Rules Ver.1.51

Evidence set: `DISCARD_BASE_2026_09_16` (`data/evidence/discard_base_evidence.json`)

## Selection decision

The next Vertical Slice is **DISCARD: move one already-selected card from the acting player's hand to that player's graveyard**.

DRAW proved Action input, Domain Events, Attempt/Result, immutability, card-instance identity, hidden information, test-only Shadow, and Production Shadow. DISCARD adds a narrow proof of **Move Semantics** without randomness, time, card civilization metadata, costs, attack state, or mana payment.

### Candidate comparison

| Candidate | New concerns | Decision |
| --- | --- | --- |
| DISCARD | Minimal hand-to-graveyard Move Semantics and private-to-public transition | Selected |
| CHARGE | Mana entry state, multicolor behavior, and timing | Deferred; too broad for the next slice |
| DESTROY | Replacement and object semantics | Deferred; introduces those concerns too early |
| TAP / UNTAP | Small deterministic state change | Deferred; does not validate Move Semantics |

## Official evidence

The design uses the official Ver.1.51 PDF registered as `dm_comprehensive_rules_1_51`.

- `701.7a`: discard moves a card from that player's hand to that player's graveyard.
- `701.7b`: normally the affected player chooses; random choice and choice by another player are exceptions.
- `402.3`: a hand is private from the other player.
- `404.1`: discarded cards are placed in the graveyard.
- `404.2`: players may view cards in a graveyard.
- `400.7`: multiple cards moving from a non-battle zone move simultaneously.

This slice is limited to one valid, already-selected card. Rule `400.7` is evidence for future batch semantics, not authority to add multi-card behavior now.

## Proposed Action

```ts
type DiscardAction = Readonly<{
  type: "DISCARD";
  actor: PlayerId;
  cardInstanceId: string;
  cause: RuleCause;
}>;
```

`actor` is the player whose hand loses the card. Selection authority is separate: opponent choice, random choice, and selection UI must not be encoded into this Action.

The input precondition is that `cardInstanceId` identifies one already-selected card in `actor`'s hand. This Design Gate does not decide whether a missing ID is an invalid Action or a rule-level failed attempt, so it does not introduce `DISCARD_FAILED_CARD_NOT_IN_HAND`.

## Proposed Events

```text
DISCARD_ATTEMPTED
CARD_DISCARDED
```

The initial successful resolution emits the attempted event followed by the discarded event. Trigger processing begins only after this operation boundary and is deferred.

## Effect Primitive boundary

DISCARD is a narrow Effect Primitive: it accepts an already-resolved card selection and performs only the semantic operation plus its Domain Events. It does not decide who selects, run a Decision Model, process replacements, dispatch triggers, or own presentation. Keeping those phases outside the primitive preserves the existing Action -> Attempt/Result -> Event separation established by DRAW.

## Move Semantics

DISCARD must remain identifiable as a semantic move rather than only array removal/insertion:

```text
source = HAND
proposedDestination = GRAVEYARD
finalDestination = GRAVEYARD
reason = DISCARD
```

The first implementation may model only what this primitive needs. It must preserve enough information in the resolution/event boundary to distinguish the proposed and final destination later, but it must not introduce a generic Move Engine at this stage.

Attempt/Result remains explicit: `DISCARD_ATTEMPTED` records only the move proposal (source and proposed destination); `CARD_DISCARDED` records the completed move, its final destination, and the preserved card instance. Replacement could eventually change the final destination, but no Replacement Processor is selected in this gate.

## RuleState change policy

Add only `graveyard: readonly RuleCard<TPayload>[]` to `RulePlayerState` when implementation begins. Keep `deck`, `hand`, and the new `graveyard` explicit. Do not refactor all Play Zones into a generic zone map.

Re-evaluate a shared zone-transition abstraction only after two or three implemented transitions demonstrate repeated structure. This slice does not require such a framework.

Register `DISCARD_REPLACEMENT` only as a future unsupported-capability candidate when implementation needs to expose the boundary. Its processing and representation are not fixed here.

## Hidden information boundary

DISCARD moves a card from private `hand` to viewable `graveyard`, the reverse visibility direction from DRAW. Rule Core models card identity and semantic movement, not UI visibility.

Legacy Adapter / Presentation remains responsible for converting the moved card to the correct public Legacy representation and for preserving viewer-specific redaction. Tests must confirm the transition without logging or exposing unrelated hand contents.

## Legacy compatibility and Shadow scope

`moveCardsBetweenZones(current, owner, "hand", "graveyard", new Set([cardInstanceId]))` provides a Legacy compatibility target. A future test-only Shadow can compare relevant projections for:

- acting player's hand IDs and order;
- acting player's graveyard IDs and destination order;
- moved card instance identity;
- Legacy presentation normalization for the now-public card;
- the other player and unrelated BoardState fields.

This connection is feasible without changing the Legacy helper.

### Production Shadow decision

Production Shadow is deferred. A generic `hand -> graveyard` drag is a manual zone move and does not necessarily express the rule keyword DISCARD. Automatically translating that gesture into `DISCARD` would invent semantic intent.

Pure Rule Core and test-only Legacy Shadow may proceed first. Production Shadow feasibility must separately establish an explicit intent source before connecting to `PlaytestBoard`.

## Initial test plan

1. Normal single discard.
2. Preserve the exact card instance.
3. Remove only the selected card from hand; preserve remaining order.
4. Append the same instance to graveyard according to the defined primitive order.
5. Leave the other player unchanged.
6. Leave unrelated state unchanged.
7. Do not mutate the input graph.
8. Produce the same output for the same state and Action.
9. Emit `DISCARD_ATTEMPTED`, then `CARD_DISCARDED`.
10. Strict-match the relevant projection of the Legacy single-card hand-to-graveyard result in test-only Shadow.
11. Verify private-hand to public-graveyard presentation at the adapter boundary without exposing unrelated hidden cards.

## Deferred scope

The following are intentionally outside this slice and are not failures:

- multi-card discard / simultaneous batch
- random discard
- opponent chooses discarded card
- discard replacement
- discard triggers
- selection UI
- Decision Model
- Production Shadow UI intent mapping
- generic Move Engine
- ZonePresence
- Object / Composition handling

## Implementation gate

Production Shadow feasibility was reviewed and deferred. Production Shadow implementation is **not authorized** until an explicit semantic DISCARD intent source exists; PlaytestBoard wiring remains deferred. The next Vertical Slice requires a separate `AI_DESIGN + HUMAN_GATE` selection.

`repoMapImpact: UPDATE_REQUIRED` — the Rule Core state, DISCARD primitive/tests, and Legacy adapter responsibilities have been added to `REPO_MAP.md`.
