# IME behavior for realtime text search

All realtime search, suggestion, and filtering inputs use the current controlled
input value while an IME composition is active. Do not wait for
`compositionend` before scheduling a search. Preserve each input's existing
debounce and query normalization.

Use `useImeRealtimeInput` for controlled text inputs when the shared composition
and final-value handling is needed. Its `onChange` forwards every displayed
value, including composition updates, and `onCompositionEnd` synchronizes the
final DOM value. Avoid issuing another request on `compositionend` when the
normalized query is unchanged.

Search results must remain protected from stale asynchronous responses using
the request cancellation or sequence guards already provided by that search
path. IME text updates and Enter actions are separate: while composition is
active, Enter must not submit a form or select a suggestion. Apply
`isImeCompositionEnter` (or an equivalent existing guard) to Enter-driven
actions.

When adding a realtime text search, keep these rules and add regression tests
for composition updates, unchanged and changed final composition values, stale
responses, and Enter during composition.
