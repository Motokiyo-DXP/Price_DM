# PROJECT_STATE

Last updated: 2026-09-16
Repository: `Motokiyo-DXP/Price_DM`
Baseline: `main@94b1aae620794b18c6f27052d276886c60933c90`
Plan: Implementation / Operations Plan v4
Rule design: Duel Masters Rule Automation v5

## Progress

- Stage 0: complete
- Stage 1 Repository Discovery: complete (read-only)
- Stage 2 Boundary Design: draft complete
- Stage 3 Data Acquisition Spike: initial official-source spike complete
- Stage 4 First Vertical Slice: DRAW Pure Rule Core + test-only Shadow implemented on branch

## Key findings

- `components/playtest-board.tsx` is the main manual-play UI/orchestrator.
- `lib/playfield-board.ts` contains the current `BoardState`, `CardInstance`, and many board transformations.
- `lib/playfield-interactions.ts` mixes gesture/presentation policy with some game-like policy.
- `components/online-match-board.tsx` wraps `PlaytestBoard`, keeps `state_version`, and submits whole candidate `BoardState` values to `update_game_room_state`.
- The server already performs hidden-state redaction/hydration, version conflict handling, server-side initial shuffling, secure shuffle/Yobinion/inspection flows, and before/after-state history.
- Existing online authority must be preserved during early Rule Core migration.
- Current manual helpers contain `Math.random()`/`Date.now()` dependencies that must not leak into deterministic Rule Core.

## Architecture direction

1. Add a Pure Rule Core beside the existing helpers.
2. Do not replace the current online persistence path during the first slice.
3. Use Shadow Mode to compare Rule Core predictions with existing manual behavior.
4. Migrate from full-state submission toward semantic Action submission only after Shadow validation.
5. Preserve current hidden-information boundaries.

## First vertical slice

Use **DRAW**.

Implementation status: **SHADOW ONLY** on `feature/motokiyo-rule-core-draw-shadow`.
The production DRAW path and online authority remain unchanged.

Reason:
- existing small legacy helper `drawRandomCard`
- official comprehensive rules have explicit draw rules
- naturally proves Attempt vs Result
- useful hidden-information boundary case
- replacement/trigger/stabilization can be exposed as future hooks rather than guessed

## Current blocker

ChatGPT GitHub read access works, but branch creation returned HTTP 403 (`Resource not accessible by integration`).
Repository writes should therefore be performed via the user's locally authenticated Codex/Git until that permission changes.

No application code or production Supabase data has been modified by ChatGPT.
