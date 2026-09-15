# CURRENT_TASK

Task ID: `CONVENIENCE_FEATURE_DEEP_DIVE`
Status: READY_FOR_NEXT_CHAT
Type: DESIGN / INVENTORY / UX ARCHITECTURE
Implementation freeze: YES, except read-only repository inspection and documentation updates

## Objective

Before continuing into deeper Rule Engine/UI implementation, perform a comprehensive review of convenience features for the Duel Masters play interface.

The goal is not merely to list ideas.

The goal is to determine:
1. what already exists,
2. what should be reused,
3. what is missing,
4. what belongs to Rule semantics vs Presentation vs Convenience,
5. what is valuable in MANUAL / ASSIST / AUTO,
6. what reduces taps and mistakes,
7. what improves rule transparency,
8. what shared UI primitives are required.

## Required investigation

Inspect the repository and current UI for:
- markers
- marking menu / long-press menu
- multiple selection
- zone movement helpers
- stack / bundle operations
- reveal / public state
- inspection
- Yobinion and other shortcuts
- mana-payment assistance
- attack / block assistance
- undo / redo
- notifications / warnings
- turn flow helpers
- hand / opponent-field expansion
- temporary/reveal areas
- any other helper or interaction not listed here

Do not assume this list is complete.

## Convenience-feature categories to explore

At minimum:
- interaction speed
- tap/click reduction
- mistake prevention
- valid-target guidance
- rule explanation / "why can't I?"
- active-effect inspection
- source / duration visibility
- pending-resolution visibility
- selection progress / constraints
- mana-payment support
- attack / block support
- action previews
- action history
- online "waiting for..." clarity
- beginner hints
- display-density controls
- mobile-specific ergonomics
- PC-specific ergonomics
- accessibility / readability
- Manual / Assist / Auto differences
- recovery / fallback usability

## Prioritization

Every candidate should eventually be scored/classified by:
- frequency
- interaction reduction
- error prevention
- rule-automation dependency
- Decision dependency
- Presentation dependency
- implementation cost
- Rule Engine cost
- mobile value
- PC value
- online value
- MANUAL value
- ASSIST value
- AUTO value
- priority: Essential / QoL / Advanced

## Deliverables

Update or create:
- `CONVENIENCE_FEATURE_CATALOG.md`
- `EXISTING_INTERACTION_INVENTORY.md`
- `UI_INTERACTION_MATRIX.md` (draft/update)
- `CONVENIENCE_PRIORITY_MATRIX.md`
- `CONVENIENCE_FEATURE_DECISIONS.md`

If the review reveals missing semantic categories, propose changes to:
- `EFFECT_PATTERN_CATALOG.md`
- `RULE_STATUS_CATALOG.md`
- `DECISION_TYPE_CATALOG.md`
- `PRESENTATION_INTENT_CATALOG.md`

Do not implement those changes in code until reviewed.

## Completion gate

This task is complete only when:
- existing features have been systematically inventoried,
- duplicate/reusable features are identified,
- new candidates are broadly explored,
- candidates are prioritized,
- dependencies on Rule/Decision/Presentation are mapped,
- the likely reusable UI component families can be estimated,
- remaining unknowns are explicit.

## Out of scope

- implementing the convenience features
- changing production behavior
- new Supabase migrations
- switching DRAW authority
- Replacement/Trigger implementation
- Semantic Compiler implementation
