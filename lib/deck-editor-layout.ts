export const DECK_EDITOR_LAYOUT = {
  desktopBreakpoint: 761,
  layoutPadding: 8,
  splitterSize: 8,
  deckMinimumWidth: 280,
  sideMinimumWidth: 420,
  analysisMinimumHeight: 220,
  searchMinimumHeight: 240,
} as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getDeckPreviewMinimumWidth(layoutWidth: number, layoutHeight: number) {
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) return DECK_EDITOR_LAYOUT.deckMinimumWidth;
  const tracksWidth = Math.max(0, layoutWidth - DECK_EDITOR_LAYOUT.layoutPadding * 2 - DECK_EDITOR_LAYOUT.splitterSize);
  const maximumDeckWidth = Math.max(0, tracksWidth - DECK_EDITOR_LAYOUT.sideMinimumWidth);
  const previewHeight = Math.max(0, layoutHeight - DECK_EDITOR_LAYOUT.layoutPadding * 2);
  return Math.min(maximumDeckWidth, Math.max(DECK_EDITOR_LAYOUT.deckMinimumWidth, previewHeight));
}

export function constrainDeckPanePercent(requested: number, layoutWidth: number, layoutHeight: number) {
  const availableWidth = Math.max(0, layoutWidth - DECK_EDITOR_LAYOUT.layoutPadding * 2 - DECK_EDITOR_LAYOUT.splitterSize);
  if (availableWidth === 0) return clamp(requested, 0, 100);
  const maximumDeckWidth = Math.max(0, availableWidth - DECK_EDITOR_LAYOUT.sideMinimumWidth);
  const minimumDeckWidth = Math.min(maximumDeckWidth, getDeckPreviewMinimumWidth(layoutWidth, layoutHeight));
  return clamp(requested, minimumDeckWidth / availableWidth * 100, maximumDeckWidth / availableWidth * 100);
}

export function resolveAnalysisResize(sideHeight: number, boundaryCenter: number) {
  const analysisMinimum = DECK_EDITOR_LAYOUT.analysisMinimumHeight;
  const maximumAnalysis = Math.max(analysisMinimum, sideHeight - DECK_EDITOR_LAYOUT.splitterSize - DECK_EDITOR_LAYOUT.searchMinimumHeight);
  const minimumCenter = DECK_EDITOR_LAYOUT.splitterSize / 2;
  const minimumNormalCenter = analysisMinimum + minimumCenter;
  const maximumCenter = maximumAnalysis + minimumCenter;
  const center = clamp(boundaryCenter, minimumCenter, maximumCenter);

  if (center < minimumNormalCenter) {
    return { mode: "overlay" as const, analysisHeight: analysisMinimum, searchOverlap: minimumNormalCenter - center };
  }

  return {
    mode: "normal" as const,
    analysisHeight: clamp(center - minimumCenter, analysisMinimum, maximumAnalysis),
    searchOverlap: 0,
  };
}

export function getAnalysisTrackPercent(analysisHeight: number, sideHeight: number) {
  const flexibleHeight = Math.max(0, sideHeight - DECK_EDITOR_LAYOUT.splitterSize - DECK_EDITOR_LAYOUT.analysisMinimumHeight - DECK_EDITOR_LAYOUT.searchMinimumHeight);
  if (flexibleHeight === 0) return 40;
  return clamp((analysisHeight - DECK_EDITOR_LAYOUT.analysisMinimumHeight) / flexibleHeight * 100, 0, 100);
}
