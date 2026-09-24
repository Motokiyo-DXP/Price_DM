export type LongPressProgress = {
  progress: number;
  remainingMs: number;
};

export function getLongPressProgress(elapsedMs: number, totalDurationMs: number): LongPressProgress | null {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(totalDurationMs) || totalDurationMs <= 0) return null;
  const elapsed = Math.min(totalDurationMs, Math.max(0, elapsedMs));
  const progress = elapsed / totalDurationMs;
  if (progress <= 0.5) return null;
  return { progress, remainingMs: totalDurationMs - elapsed };
}
