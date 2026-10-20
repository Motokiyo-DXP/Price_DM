export const previewArea = { width: 710, height: 510, gap: 4 };

/** Fit every copy into the preview, keeping a 5:7 card frame with no overlap. */
export function getDeckShareImageLayout(count: number) {
  let best = { columns: 1, rows: Math.max(1, count), cardWidth: 0 };
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const rows = Math.ceil(Math.max(1, count) / columns);
    const cardWidth = Math.min(
      (previewArea.width - (columns - 1) * previewArea.gap) / columns,
      (previewArea.height - (rows - 1) * previewArea.gap) / rows * 5 / 7,
    );
    if (cardWidth > best.cardWidth + 0.001) best = { columns, rows, cardWidth };
  }
  const cardWidth = Math.floor(best.cardWidth * 100) / 100;
  const cardHeight = cardWidth * 7 / 5;
  const width = best.columns * cardWidth + (best.columns - 1) * previewArea.gap;
  const height = best.rows * cardHeight + (best.rows - 1) * previewArea.gap;
  return {
    ...best, cardWidth, cardHeight,
    cells: Array.from({ length: count }, (_, index) => ({
      left: (previewArea.width - width) / 2 + index % best.columns * (cardWidth + previewArea.gap),
      top: (previewArea.height - height) / 2 + Math.floor(index / best.columns) * (cardHeight + previewArea.gap),
    })),
  };
}

export function expandDeckShareCards<T extends { zone: string; sort_order: number; quantity: number }>(cards: readonly T[]) {
  return cards.toSorted((a, b) => Number(a.zone !== "main") - Number(b.zone !== "main") || a.zone.localeCompare(b.zone) || a.sort_order - b.sort_order)
    .flatMap(card => Array.from({ length: card.quantity }, () => card));
}
