# REPO_MAP — Rule Automation Scope

Current implementation baseline: see `PROJECT_STATE.md`.

| Path | Current responsibility | Rule automation role |
|---|---|---|
| `app/playtest/[deckId]/page.tsx` | solo entry / deck loading | composition layer |
| `components/playtest-board.tsx` | manual-play UI, gestures, state orchestration | presentation / compatibility adapter |
| `lib/playfield-board.ts` | board types + transformations; behavior-preserving Legacy TAP transformation seam with explicit UNTAP marker policy | legacy domain model; R10 Production comparison source |
| `lib/playfield-interactions.ts` | zones, move defaults, gestures, mana checks, shortcuts | split UI policy from game policy over time |
| `lib/rule-engine/types.ts`, `actions.ts`, `events.ts`, `engine.ts` | Pure Rule Core contracts, explicit deck/hand/graveyard and mana-only wrapper state, and DRAW/DISCARD/TAP dispatch | deterministic semantic rule boundary |
| `lib/rule-engine/primitives/draw.ts` | immutable single-card DRAW primitive | first Vertical Slice |
| `lib/rule-engine/primitives/discard.ts` | immutable, already-selected single-card DISCARD primitive | second Vertical Slice |
| `lib/rule-engine/primitives/tap.ts` | immutable mana-only TAP primitive preserving card identity | third Vertical Slice |
| `lib/rule-engine/adapters/legacy-board.ts` | DRAW/DISCARD/TAP legacy projection, TAP result application, presentation normalization, Shadow comparison | legacy boundary adapter |
| `lib/rule-engine/draw*.test.mjs`, `discard*.test.mjs`, `tap*.test.mjs` | DRAW/DISCARD/TAP semantics and test-only Legacy Shadow checks | Vertical Slice validation |
| `scripts/check-dm-rule-source.mjs` | official Rule Index metadata fetch, extraction, and manifest comparison | Rule Source Watcher v1 |
| `scripts/check-dm-rule-source.test.mjs`, `scripts/fixtures/rule-source/*` | deterministic Rule Source Watcher validation | CI-safe source monitoring fixtures |
| `lib/playtest-initial-state.ts` | controlled vs initial state | compatibility helper |
| `app/rooms/[roomId]/battle/page.tsx` | online battle server entry | composition layer |
| `components/online-match-board.tsx` | realtime, RPC, history, controlled board | online infrastructure adapter |
| `lib/online-room-snapshot.ts` | versioned snapshot acceptance | snapshot adapter |
| `lib/online-board-change.ts` | state diff -> human notice | presentation projection |
| `lib/online-card-operation.ts` | realtime interaction signal parsing | presence/presentation |
| `app/rooms/actions.ts` | room/lobby server actions | lifecycle outside Rule Core |
| `supabase/migrations/*online*` | authoritative room state/security/history | persistence/security adapter |
| `lib/playfield-board.test.mjs` | manual board regression tests | legacy regression oracle |
| `lib/playfield-interactions.test.mjs` | interaction tests | separate UI-contract tests later |
| `lib/online-room-snapshot.test.mjs` | snapshot tests | online adapter regression |
| `CARD_DB_IMPORT_SPEC.md` | card DB/import analysis | reuse data design |

## Primary seam

Current:

```text
PlaytestBoard
  -> playfield-board helper
  -> next BoardState
```

Target during Shadow:

```text
UI Intent
  -> Compatibility Action Adapter
      -> legacy helper (production)
      -> Pure Rule Core (shadow)
  -> Shadow Comparator
```

## Online compatibility path

Current generic online update:

```text
PlaytestBoard computes next BoardState
  -> OnlineMatchBoard.saveState(next)
  -> update_game_room_state(expectedVersion, whole state)
  -> server hydrate/check/persist
  -> state_version++
  -> realtime refresh
```

Keep this path during the first Rule Core slice.

## Drift rule

Each future Codex task reports:

`repoMapImpact: NONE | UPDATE_REQUIRED`

Update this file only when responsibilities, public interfaces, dependency directions, or core/online boundaries materially change.

R9 `repoMapImpact: UPDATE_REQUIRED` — the exported Legacy TAP helper is now shared by normal tap and marking-menu entry points; Rule Core and Online boundaries remain unchanged.
