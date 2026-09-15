# Stage 4 Vertical Slice — DRAW

Status: DESIGN READY

## Scope

Implement base DRAW semantics only.

The slice must prove:
- Action input
- Attempt/Result
- immutable transition
- card instance identity preservation
- deck -> hand transition
- Domain Events
- evidence-linked tests
- Shadow comparison

## Proposed action

```ts
type DrawAction = {
  type: "DRAW";
  actor: PlayerId;
  count: number;
  cause: RuleCause;
};
```

Resolve `count` as repeated one-card attempts.

## Proposed events

```text
DRAW_ATTEMPTED
CARD_DRAWN
DRAW_FAILED_NO_CARD
```

Card identity must only be exposed to allowed visibility scopes.

## Initial fixtures

1. Normal draw
   - top card leaves deck
   - same instance enters hand
   - deck order otherwise unchanged
   - attempted + drawn events

2. Empty deck attempt
   - state unchanged
   - attempted + failed-no-card events

3. Draw two
   - two sequential single draws
   - order preserved

4. Immutability
   - input state unchanged

5. Shadow comparison
   - compare normal fixture against legacy `drawRandomCard`
   - relevant state projection should strict-match

## Deferred but explicitly registered

- draw replacement
- draw-trigger processing
- deck-empty win/loss stabilization
- progressive optional draws
- simultaneous multi-player draws
- client prediction

Unsupported semantic hooks must be visible as unsupported, never silently ignored.
