# PROJECT_STATE — Rule Automation

Last updated: 2026-09-16
Repository: `Motokiyo-DXP/Price_DM`
Verified main at handoff: `125bed44cea6f9ea2b6575af8ac689bb2020d1d9`

## Current status

Completed:
- Repository / architecture discovery
- Rule Engine boundary design
- Official evidence baseline
- DRAW Pure Rule Core
- DRAW unit tests
- Legacy DRAW test-only Shadow comparison
- PR #1 merged: Stage 1–3 documentation baseline
- PR #2 merged: DRAW Rule Core + test-only Shadow

Current maturity:
- Base DRAW: `SHADOW`
- Production DRAW path: still legacy-authoritative
- Production Shadow connection: not yet implemented

## Important architecture decisions

- Pure Rule Core stays independent from React / Next.js / Supabase UI.
- Existing online authority, hidden-info protection, version checks, and current rollback/history remain in place during early migration.
- Current `BoardState` is transitional; it is not automatically the permanent Rule Engine state.
- Manual Marker is not Rule Engine truth.
- Manual Annotation, Manual Override, and Manual Fallback are separate concepts.
- Rule Engine emits semantic results; Presentation chooses Marker / Badge / Highlight / Modal / Sheet / Toast, etc.
- Do not build a second Undo system.
- Do not prebuild a huge Turn State Machine.
- Unsupported semantics must be explicit and never guessed.

## Current strategic change

Before moving deeper into Decision System, complex effects, or advanced rule automation, perform a dedicated convenience-feature design phase.

This phase is now a required design gate.

The project must deeply examine:
- existing convenience features
- missing convenience features
- interaction-cost reduction
- error prevention
- rule explanation / transparency
- selection assistance
- online-play clarity
- current-effect visualization
- action history
- mobile ergonomics
- Manual / Assist / Auto usefulness

The convenience-feature phase should be completed before finalizing the reusable UI interaction system.

## Immediate next task

The next chat should begin with:
`CONVENIENCE_FEATURE_DEEP_DIVE`

This is design/research first, not implementation.

After that review, update:
- convenience catalog
- UI interaction matrix
- implementation roadmap
- any affected Effect / Status / Decision / Presentation catalogs

Only then decide whether to proceed first with DRAW Production Shadow, UI foundation, or the next primitive.

## Safety constraints

Do not:
- switch production DRAW to Rule Core yet
- change online authority
- create speculative DB tables for Shadow telemetry
- treat visual markers as rules
- implement card-specific popup sprawl
- let AI guess unknown rulings
- move into complex Replacement / Trigger UI before the convenience/UI design gate is satisfied
