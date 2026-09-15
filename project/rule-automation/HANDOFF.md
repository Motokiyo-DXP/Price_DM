# HANDOFF — Duel Masters Rule Automation

Date: 2026-09-16
Repository: `Motokiyo-DXP/Price_DM`
Verified main at handoff: `125bed44cea6f9ea2b6575af8ac689bb2020d1d9`

## What the next chat should know

This project is building a deterministic Duel Masters Rule Engine beside an existing manual simulator.

The approach is incremental:
- preserve current manual freedom,
- add semantic Rule Core,
- compare in Shadow,
- classify user Decisions and presentation needs,
- automate only well-verified capabilities.

## Verified progress

Merged to main:
- PR #1: Stage 1–3 documentation baseline
- PR #2: DRAW Pure Rule Core + test-only Shadow

Base DRAW currently supports:
- semantic DRAW action
- repeated single-card resolution
- empty-deck attempt
- immutable transition
- semantic Domain Events
- legacy adapter
- strict test-only comparison with legacy DRAW

Production is still legacy-authoritative.

## Current main principle

The next step is NOT "keep coding Rule Engine as fast as possible."

Before deeper UI/Decision/advanced-rule implementation, the user wants a deliberate, deep convenience-feature review.

This review is now a design gate.

## Next-chat priority

Start with `CURRENT_TASK.md`:
`CONVENIENCE_FEATURE_DEEP_DIVE`.

First inspect existing repository behavior, then explore missing convenience features broadly.

Important: do not limit the review to ideas already mentioned in prior chats.

The next chat should actively search for:
- repeated interaction friction,
- preventable misoperations,
- information users repeatedly need,
- states currently only understandable from memory,
- operations that can be reduced from many taps to one gesture,
- online ambiguity,
- rule explanation opportunities,
- places where current manual features can be reused by ASSIST/AUTO.

## Architecture rules to preserve

- Rule Engine semantics are separate from visual UI.
- Rule Status != Marker.
- Effect != Decision != Presentation.
- Manual Annotation != Override != Fallback.
- Existing Undo/history should be extended later, not replaced.
- Unsupported rule cases must not be guessed.
- Reusable interaction patterns are preferred over card-specific UI.
- Mobile and PC may render the same semantic interaction differently.

## Existing implementation/reference documents

Read from the repository:
- `AGENTS.md`
- `project/rule-automation/PROJECT_STATE.md`
- `project/rule-automation/REPO_MAP.md`
- `project/rule-automation/CURRENT_ARCHITECTURE.md`
- `project/rule-automation/BOUNDARY_DESIGN_DRAFT.md`
- `project/rule-automation/VERTICAL_SLICE_DRAW.md`
- `project/rule-automation/data/evidence/draw_base_evidence.json`

After this handoff package is persisted, also read:
- `HANDOFF.md`
- `CURRENT_TASK.md`
- `IMPLEMENTATION_PLAN_V10.md`
- `HUMAN_ROADMAP.md`
- `CONVENIENCE_FEATURE_RESEARCH_BRIEF.md`
- `CAPABILITY_MATRIX.md`

## Git workflow

Feature branch + PR only.
Do not push directly to `main`.

ChatGPT's GitHub connection can read the repo, but branch creation has returned HTTP 403. Use locally authenticated Codex/Git for repository writes unless permissions change.
