# CURRENT_ARCHITECTURE — Rule Automation Baseline

## Current state

`lib/playfield-board.ts` defines a UI-oriented `BoardState` containing:
- players/zones
- card identity and card metadata
- face/tap state
- markers
- stack metadata
- turn/active player
- shield placement order
- notifications
- turn request
- inspection state

This is useful as a transition model but should not automatically become the permanent Rule Engine state because game, UI and manual-simulator concerns are mixed.

## Solo flow

```text
app/playtest/[deckId]/page.tsx
  -> load deck/card metadata
  -> initial board
  -> PlaytestBoard
  -> playfield-board transformations
  -> local React state
```

## Online flow

```text
battle page
  -> get_game_room_state
  -> OnlineMatchBoard
  -> controlled PlaytestBoard
  -> local candidate BoardState
  -> update_game_room_state(expected state_version, candidate)
  -> server hidden-state hydration / validation
  -> game_rooms.state + state_version
  -> realtime refresh
```

Generic online interactions are therefore currently **state-submission based**, not semantic-Action based.

## Existing server authority to preserve

The existing server/database path already provides:
- participant authorization
- `state_version` conflict detection
- row locking
- hidden-state redaction
- hydration of submitted redacted state
- server-side initial deck shuffle
- dedicated server-side random/sensitive operations
- undo/redo history
- room lifecycle and presence

Do not rewrite this wholesale for Stage 4.

## Existing history

`game_room_actions` stores broad action kind plus before/after full states.

Treat it as the initial rollback/history mechanism.
Do not add a competing event-store immediately.

## Determinism gap

Legacy helpers use runtime randomness/time for some operations:
- `Math.random`
- `Date.now`

Future Rule Core must inject:
- `RandomSource`
- `Clock`
- `IdGenerator`

The base DRAW primitive needs none of these because deck order already exists.

## Migration sequence

### Phase A — Shadow
Existing state persistence remains authoritative. Rule Core predicts only.

### Phase B — Assist
Rule Core proposes Decisions/actions; user confirms; compatibility persistence remains.

### Phase C — semantic server authority
Only after evidence and Shadow validation:

```text
Client Action
  -> trusted server Rule Core
  -> authoritative next state
  -> versioned persistence
  -> Domain Events
  -> clients
```

The exact trusted execution host is intentionally undecided.
