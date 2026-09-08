export type CardStageFit = {
  height: number;
  scale: number;
  width: number;
};

export function fitCardStage(
  viewportWidth: number,
  viewportHeight: number,
  baseWidth: number,
  baseHeight: number,
): CardStageFit {
  if (![viewportWidth, viewportHeight, baseWidth, baseHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { height: 0, scale: 0, width: 0 };
  }

  const scale = Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight);
  return {
    height: baseHeight * scale,
    scale,
    width: baseWidth * scale,
  };
}
