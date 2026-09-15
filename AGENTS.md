# Codex Project Instructions

## Bug fixing

When fixing bugs, do not make speculative changes.

Follow this process:

1. Reproduce the bug before modifying code whenever possible.
2. Investigate all related code before deciding on the cause.
3. Identify the root cause.
4. Apply the smallest appropriate fix.
5. Run the application and verify the actual user-visible behavior.
6. Run relevant tests and checks.
7. Do not claim that a bug is fixed only because the build succeeds.

For UI bugs, inspect when relevant:

- event propagation
- pointer / click / touch handlers
- React state
- duplicate handlers
- parent and child interactions
- CSS conflicts
- computed styles
- z-index
- overflow
- transform
- responsive/mobile implementations
- duplicate components

If the bug cannot be reproduced, do not guess at a fix.
Report that it could not be reproduced and explain what was investigated.

When a previous fix has already failed, inspect git diff/history and previous changes related to the bug before adding another workaround.

Prefer root-cause fixes over CSS offsets, delays, arbitrary conditionals, or other symptom-hiding patches.
