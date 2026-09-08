export const PLAY_INPUT_DEFAULTS = { doubleTapMs: 260, dragStartPx: 8, longPressMs: 460, markingSelectionPx: 42, specialMoveSelectionPx: 48, dragonYobinionBranchPx: 170, circleMinimumPoints: 12 } as const;
export const LONG_PRESS_MIN_MS = 320;
export const LONG_PRESS_MAX_MS = 800;
export const LONG_PRESS_STORAGE_KEY = "dm-play-long-press-ms";
export function normalizeLongPressMs(value: number) { return Number.isFinite(value) ? Math.min(LONG_PRESS_MAX_MS, Math.max(LONG_PRESS_MIN_MS, Math.round(value))) : PLAY_INPUT_DEFAULTS.longPressMs; }
export function readLongPressMs() { return typeof window === "undefined" ? PLAY_INPUT_DEFAULTS.longPressMs : normalizeLongPressMs(Number(window.localStorage.getItem(LONG_PRESS_STORAGE_KEY))); }
export function saveLongPressMs(value: number) { const normalized = normalizeLongPressMs(value); window.localStorage.setItem(LONG_PRESS_STORAGE_KEY, String(normalized)); return normalized; }
