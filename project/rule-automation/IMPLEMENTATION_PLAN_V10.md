# IMPLEMENTATION_PLAN_V10 — Human + Technical Integrated Plan

## Core sequence

1. Preserve the current manual simulator.
2. Build Pure Rule Core beside it.
3. Verify simple semantics in test Shadow.
4. Before deeper automation, classify interaction needs.
5. Deeply review convenience features before locking common UI.
6. Build shared Decision / Status / Presentation foundations.
7. Add primitives incrementally.
8. Add Timing / duration only when required.
9. Add continuous effects.
10. Add replacement / trigger / pending / stabilization.
11. Formalize Effect IR.
12. Add Semantic Compiler only after IR is stable.
13. Promote capabilities independently from MANUAL_ONLY -> SHADOW -> ASSIST -> AUTO.

## Current position

Steps 1–3 are complete for base DRAW.

The immediate gate is now:

`Convenience Feature Deep-Dive`

before final common interaction architecture is locked.

## Parallel tracks after the convenience review

### Rule track
DRAW Production Shadow -> next primitives -> timing -> advanced resolution.

### Interaction track
Effect Pattern -> Rule Status -> Decision Type -> Presentation Intent -> UI Interaction Matrix -> reusable components.

## Non-negotiable design principles

- UI does not define rules.
- Markers are presentation/annotation, not rule truth.
- Existing online authority remains until intentionally migrated.
- No duplicate Undo architecture.
- No speculative full Turn State Machine.
- No card-specific popup explosion.
- Unknown semantics are explicit.
