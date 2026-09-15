# Stage 2 Boundary Design Draft

Status: DRAFT READY FOR IMPLEMENTATION VALIDATION

## 1. New module boundary

Recommended:

```text
lib/rule-engine/
  types.ts
  actions.ts
  events.ts
  engine.ts
  primitives/
    draw.ts
  adapters/
    legacy-board.ts
```

Do not move all of `playfield-board.ts` into Rule Core.

## 2. Transitional model

Current `BoardState` remains the production/manual representation initially.

Use an explicit adapter so current UI-only fields do not become permanent Rule Engine schema by accident.

## 3. Immutability

Rule Core must not mutate input objects/arrays.
Structural sharing is allowed.

## 4. Deterministic dependencies

No direct `Math.random()` or `Date.now()` in Rule Core.
Inject services when needed.

## 5. Domain Events

Rule Core outputs semantic events, e.g.:

- `DRAW_ATTEMPTED`
- `CARD_DRAWN`
- `DRAW_FAILED_NO_CARD`

Animation instructions are created by the Presentation Adapter, not Rule Core.

## 6. Online authority

Stage 4 must not change production `update_game_room_state`, hidden-state security, room history, server shuffle or server Yobinion.

## 7. Hidden information

Do not expose full authoritative hidden state to clients merely to make Rule Core easy to execute.

## 8. Tests and evidence

Legacy tests prove compatibility.
Official evidence proves game semantics.
Do not treat one as a substitute for the other.

## 9. Codex escalation

If an undecided architecture choice is required, return `BLOCKED_SPEC`.
Do not guess.
