type DeckIconCard = {
  canonical_card_id: number;
  card_print_id: number | null;
  zone: string;
};

export type DeckIconSelection = {
  canonicalCardId: number;
  cardPrintId: number | null;
};

export function getDeckIconSelection(
  cards: readonly DeckIconCard[],
  preferredCanonicalCardId: number | null,
): DeckIconSelection | null {
  const mainCards = cards.filter((card) => card.zone === "main");
  const canonicalCardId = preferredCanonicalCardId ?? mainCards[0]?.canonical_card_id;
  if (typeof canonicalCardId !== "number") return null;

  const selectedCard = mainCards.find((card) => card.canonical_card_id === canonicalCardId);
  return {
    canonicalCardId,
    cardPrintId: selectedCard?.card_print_id ?? null,
  };
}
