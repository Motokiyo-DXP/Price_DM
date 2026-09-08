export type SortDirection = "asc" | "desc";

export type DeckSortKey = "added" | "name" | "quantity" | "cost";
export type SearchSortKey = "relevance" | "name" | "prints" | "newest" | "usage";

type DeckSortable = { cost?: number | null; name: string; quantity: number };
type SearchSortable = { name: string; newestPrintId: number; print_count: number; usage_count?: number };

function directionMultiplier(direction: SortDirection) {
  return direction === "asc" ? 1 : -1;
}

function compareNullableNumbers(left: number | null | undefined, right: number | null | undefined, direction: SortDirection) {
  const leftKnown = typeof left === "number";
  const rightKnown = typeof right === "number";
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (!leftKnown || !rightKnown) return 0;
  return (left - right) * directionMultiplier(direction);
}

export function sortDeckCards<T extends DeckSortable>(cards: readonly T[], key: DeckSortKey, direction: SortDirection) {
  const indexed = cards.map((card, index) => ({ card, index }));
  indexed.sort((left, right) => {
    let result = 0;
    if (key === "added") result = (left.index - right.index) * directionMultiplier(direction);
    if (key === "name") result = left.card.name.localeCompare(right.card.name, "ja") * directionMultiplier(direction);
    if (key === "quantity") result = (left.card.quantity - right.card.quantity) * directionMultiplier(direction);
    if (key === "cost") result = compareNullableNumbers(left.card.cost, right.card.cost, direction);
    return result || left.card.name.localeCompare(right.card.name, "ja") || left.index - right.index;
  });
  return indexed.map(({ card }) => card);
}

export function sortSearchCards<T extends SearchSortable>(cards: readonly T[], key: SearchSortKey, direction: SortDirection) {
  const indexed = cards.map((card, index) => ({ card, index }));
  indexed.sort((left, right) => {
    let result = 0;
    if (key === "relevance") result = (left.index - right.index) * directionMultiplier(direction);
    if (key === "name") result = left.card.name.localeCompare(right.card.name, "ja") * directionMultiplier(direction);
    if (key === "prints") result = (left.card.print_count - right.card.print_count) * directionMultiplier(direction);
    if (key === "usage") result = ((left.card.usage_count ?? 0) - (right.card.usage_count ?? 0)) * directionMultiplier(direction);
    if (key === "newest") result = (left.card.newestPrintId - right.card.newestPrintId) * directionMultiplier(direction);
    return result || left.card.name.localeCompare(right.card.name, "ja") || left.index - right.index;
  });
  return indexed.map(({ card }) => card);
}
