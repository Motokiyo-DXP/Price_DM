# CONVENIENCE_FEATURE_RESEARCH_BRIEF

## Purpose

Perform a full convenience-feature design pass before locking the next generation of interaction UI.

This is broader than "what extra buttons should we add?"

The review should ask:

- What should require fewer taps?
- What does the player have to remember unnecessarily?
- What mistakes can the UI prevent without taking away manual freedom?
- What rule information should be visible instead of memorized?
- What can be automatically highlighted or explained?
- What existing manual feature can become an ASSIST/AUTO presentation later?
- What is different on mobile vs PC?
- What becomes confusing in online play when one player is waiting for the other?

## Investigation method

### 1. Existing feature inventory
Read implementation before proposing replacements.

### 2. Friction inventory
List workflows that take too many operations or frequently cause confusion.

### 3. Information inventory
List information players need during play:
- legal targets
- selected count
- active modifiers
- effect source
- effect duration
- current processing source
- pending effects
- why an action is unavailable
- whose input is awaited
- public/private status
- recent actions

### 4. Candidate generation
Explore ideas under:
- speed
- error prevention
- selection assistance
- rule transparency
- state visibility
- mana/payment
- combat
- history
- online communication
- accessibility
- mobile ergonomics
- expert shortcuts
- beginner guidance
- fallback/recovery

### 5. Reuse check
For each candidate, identify whether the site already has:
- the behavior,
- part of the UI,
- a related marker,
- a related gesture,
- a related state field,
- a related online sync path.

### 6. Mode mapping
Evaluate in:
- MANUAL
- ASSIST
- AUTO

### 7. Priority
Classify:
- Essential
- Quality of Life
- Advanced

## Important design rule

Convenience features must not silently become rule authority.

Examples:
- an "attackable" highlight is derived from Rule Engine status; highlight itself does not define legality.
- a manually added Blocker marker is an annotation unless explicitly promoted through a supported override workflow.
- an automatic target highlight is presentation of a Decision candidate set, not the Decision itself.

## Expected result

At the end of the review we should know:
- which existing features survive unchanged,
- which features should be generalized,
- which new features matter most,
- which need Rule Engine data,
- which need Decision data,
- which are presentation-only,
- what reusable UI component families are actually needed.
