export const PLAY_INPUT_DEFAULTS = {
  doubleTapMs: 260,
  dragStartPx: 8,
  longPressMs: 400,
  markingSelectionPx: 42,
  specialMoveSelectionPx: 48,
  circleMinimumPoints: 12,
} as const;

export const LONG_PRESS_DEFAULT_MS = PLAY_INPUT_DEFAULTS.longPressMs;
export const LONG_PRESS_MIN_MS = 320;
export const LONG_PRESS_MAX_MS = 600;
export const LONG_PRESS_STEP_MS = 20;

export function normalizeLongPressMs(value: number) {
  if (!Number.isFinite(value)) return LONG_PRESS_DEFAULT_MS;
  const clamped = Math.min(LONG_PRESS_MAX_MS, Math.max(LONG_PRESS_MIN_MS, value));
  const stepIndex = Math.round((clamped - LONG_PRESS_MIN_MS) / LONG_PRESS_STEP_MS);
  return LONG_PRESS_MIN_MS + stepIndex * LONG_PRESS_STEP_MS;
}
