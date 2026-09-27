import type { BoardState } from "./playfield-board.ts";
import { getCardImageUrl } from "./card-image.ts";
import { pickCardPrintRepresentativesByCanonicalCardId, type OrderableCardPrint } from "./card-print-order.ts";

export type BoardCardPrint = OrderableCardPrint & {
  canonical_card_id: number;
  image_key: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectBoardCanonicalCardIds(board: unknown): number[] {
  const ids = new Set<number>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    if (Number.isSafeInteger(value.canonicalCardId) && Number(value.canonicalCardId) > 0) {
      ids.add(Number(value.canonicalCardId));
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(board);
  return [...ids];
}

export function collectBoardCanonicalCardIdsNeedingImages(board: unknown): number[] {
  const ids = new Set<number>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    if (Number.isSafeInteger(value.canonicalCardId)
      && Number(value.canonicalCardId) > 0
      && Object.hasOwn(value, "imageUrl")
      && typeof value.imageUrl !== "string") {
      ids.add(Number(value.canonicalCardId));
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(board);
  return [...ids];
}

export function resolveOnlineBoardCardImages(board: BoardState, prints: readonly BoardCardPrint[]): BoardState {
  const representatives = pickCardPrintRepresentativesByCanonicalCardId(prints);
  const printsById = new Map(prints.map((print) => [print.id, print]));

  const resolve = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const resolved = value.map(resolve);
      return resolved.every((item, index) => item === value[index]) ? value : resolved;
    }
    if (!isRecord(value)) return value;

    let changed = false;
    const resolvedEntries = Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const resolvedChild = resolve(child);
      if (resolvedChild !== child) changed = true;
      return [key, resolvedChild];
    }));
    if (!Number.isSafeInteger(value.canonicalCardId) || !Object.hasOwn(value, "imageUrl")) return changed ? resolvedEntries : value;

    const canonicalCardId = Number(value.canonicalCardId);
    const selectedPrint = typeof value.cardPrintId === "number" ? printsById.get(value.cardPrintId) : null;
    const selectedImageKey = selectedPrint?.canonical_card_id === canonicalCardId ? selectedPrint.image_key : null;
    const imageKey = selectedImageKey ?? representatives.get(canonicalCardId)?.imageKey ?? null;
    const imageUrl = getCardImageUrl(imageKey);
    if (resolvedEntries.imageUrl === imageUrl) return changed ? resolvedEntries : value;
    return { ...resolvedEntries, imageUrl };
  };

  return resolve(board) as BoardState;
}
