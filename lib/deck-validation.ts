import { parseEditorSort, type EditorSortKey, type SortDirection } from "./deck-sorting.ts";
export type DeckCardInput = {
  canonicalCardId: number;
  cardPrintId: number | null;
  name: string;
  quantity: number;
};

export type DeckInput = {
  name: string;
  format: "original" | "advanced" | "duel_party";
  visibility: "private" | "unlisted" | "public";
  description: string;
  cards: DeckCardInput[];
  editorSortKey: EditorSortKey;
  editorSortDirection: SortDirection;
};

const formats = new Set(["original", "advanced", "duel_party"]);
const visibilities = new Set(["private", "unlisted", "public"]);
export const MAX_MAIN_DECK_CARDS = 60;
export const MAX_COPIES_PER_CARD = 4;

export function getDeckCardAddCount(currentTotal: number, currentQuantity: number, requested: number, deckLimit = MAX_MAIN_DECK_CARDS) {
  return Math.max(0, Math.min(
    Math.floor(requested),
    MAX_COPIES_PER_CARD - currentQuantity,
    deckLimit - currentTotal,
  ));
}

export function parseDeckInput(formData: FormData): DeckInput | null {
  const editorSort = parseEditorSort(formData.get("editorSortKey") ?? "saved", formData.get("editorSortDirection") ?? "asc");
  if (!editorSort) return null;
  const nameValue = formData.get("name");
  const formatValue = formData.get("format");
  const visibilityValue = formData.get("visibility");
  const descriptionValue = formData.get("description");
  const cardsValue = formData.get("cards");

  if (
    typeof nameValue !== "string" ||
    typeof formatValue !== "string" ||
    typeof visibilityValue !== "string" ||
    typeof descriptionValue !== "string" ||
    typeof cardsValue !== "string"
  ) return null;

  const name = nameValue.trim();
  const description = descriptionValue.trim();
  if (
    name.length < 1 ||
    name.length > 60 ||
    description.length > 1000 ||
    !formats.has(formatValue) ||
    !visibilities.has(visibilityValue)
  ) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cardsValue);
  } catch {
    return null;
  }
  const deckLimit = MAX_MAIN_DECK_CARDS;
  if (!Array.isArray(parsed) || parsed.length > deckLimit) return null;

  const ids = new Set<number>();
  const cards: DeckCardInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const canonicalCardId = candidate.canonicalCardId;
    const quantity = candidate.quantity;
    const cardPrintId = candidate.cardPrintId ?? null;
    const cardName = candidate.name;
    if (
      typeof canonicalCardId !== "number" ||
      !Number.isSafeInteger(canonicalCardId) ||
      canonicalCardId <= 0 ||
      (cardPrintId !== null && (typeof cardPrintId !== "number" || !Number.isSafeInteger(cardPrintId) || cardPrintId <= 0)) ||
      ids.has(canonicalCardId) ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_COPIES_PER_CARD ||
      typeof cardName !== "string" ||
      cardName.trim().length < 1 ||
      cardName.trim().length > 200
    ) return null;
    ids.add(canonicalCardId);
    cards.push({ canonicalCardId, cardPrintId: cardPrintId as number | null, quantity, name: cardName.trim() });
  }

  if (cards.reduce((total, card) => total + card.quantity, 0) > deckLimit) return null;

  return {
    name,
    format: formatValue as DeckInput["format"],
    visibility: visibilityValue as DeckInput["visibility"],
    description,
    cards,
    editorSortKey: editorSort.key,
    editorSortDirection: editorSort.direction,
  };
}
