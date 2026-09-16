# PROJECT_STATE

Last updated: 2026-09-16
Repository: `Motokiyo-DXP/Price_DM`
Baseline: `main@f6719988a592a797b7948212d8bad9f794f734c9`
Implementation / Operations Plan: `project/rule-automation/IMPLEMENTATION_OPERATIONS_PLAN.md`
Rule design: Duel Masters Rule Automation v5

## Progress

- Stage 0: complete
- Stage 1 Repository Discovery: complete
- Stage 2 Boundary Design: complete enough for implementation
- Stage 3 Data Acquisition Spike: initial official-source spike complete
- Stage 4 DRAW Pure Rule Core: complete
- Stage 4 DRAW test-only Shadow: complete and merged to `main` via PR #2
- Convenience Architecture Review: complete; no longer a Rule Core blocker
- Stage 4.5 DRAW Production Shadow: complete and merged to `main` via PR #5
- Minimal CI: complete and merged to `main` via PR #6
- R2 DRAW Shadow Validation: COMPLETE / MAIN via PR #7
- Rule Source Watcher v1: COMPLETE / MAIN via PR #8
- R3 Next Vertical Slice: DISCARD SELECTED

## Key findings

- `components/playtest-board.tsx` is the main manual-play UI/orchestrator.
- `lib/playfield-board.ts` contains the current `BoardState`, `CardInstance`, and many board transformations.
- `lib/playfield-interactions.ts` mixes gesture/presentation policy with some game-like policy.
- `components/online-match-board.tsx` wraps `PlaytestBoard`, keeps `state_version`, and submits whole candidate `BoardState` values to `update_game_room_state`.
- The server already performs hidden-state redaction/hydration, version conflict handling, server-side initial shuffling, secure shuffle/Yobinion/inspection flows, and before/after-state history.
- Existing online authority must be preserved during early Rule Core migration.
- Current manual helpers contain `Math.random()`/`Date.now()` dependencies that must not leak into deterministic Rule Core.

## Architecture direction

1. Place the Pure Rule Core beside the Legacy Board.
2. Do not change existing Online authority during early migration.
3. Use Shadow Mode to compare Legacy and Rule Core results.
4. Consider semantic Action authority only after Shadow validation.
5. Preserve the hidden-information boundary.
6. Do not turn the Convenience Layer into a Rule Engine or Workflow Engine.
7. Apply Automation First to repeatable work and leave a reusable mechanism.

## Completed vertical slice

Use **DRAW**.

Implementation status: the Pure Rule Core and test-only Shadow are complete and merged to `main` via PR #2. Stage 4.5 DRAW Production Shadow is complete and merged to `main` via PR #5.

R2 validation confirms the complete DRAW path from Pure Rule Core through test-only Shadow and Production Shadow. See [`DRAW_SHADOW_VALIDATION.md`](./DRAW_SHADOW_VALIDATION.md) for the evidence record.

During Stage 4.5, only the Legacy result has Production authority. The Rule Core result is comparison-only. The production Online authority and hidden-information boundary remain unchanged.

Reason:

- existing small legacy helper `drawRandomCard`
- official comprehensive rules have explicit draw rules
- naturally proves Attempt vs Result
- useful hidden-information boundary case
- replacement/trigger/stabilization can be exposed as future hooks rather than guessed

## Next vertical slice

Use **DISCARD**: one valid, already-selected card moves from the acting player's hand to that player's graveyard.

Status: DESIGN READY. Evidence and scope are defined in [`VERTICAL_SLICE_DISCARD.md`](./VERTICAL_SLICE_DISCARD.md) and `data/evidence/discard_base_evidence.json`.

Next: DISCARD Pure Rule Core + test-only Shadow. Production Shadow remains deferred until semantic DISCARD intent can be distinguished from a generic manual hand-to-graveyard move.

## Source of truth

1. Production security / online authority
2. `PROJECT_STATE.md`
3. `IMPLEMENTATION_OPERATIONS_PLAN.md`
4. `BOUNDARY_DESIGN_DRAFT.md`
5. `REPO_MAP.md`
6. individual older specs

For official Duel Masters rule content, official evidence takes precedence.

## Rule source automation

`scripts/check-dm-rule-source.mjs` compares the official comprehensive-rules Version, update date, and PDF URL against `source_manifest.yaml` without AI. Live fetch is local-only; CI uses deterministic fixtures. See [`RULE_SOURCE_WATCHER.md`](./RULE_SOURCE_WATCHER.md).
