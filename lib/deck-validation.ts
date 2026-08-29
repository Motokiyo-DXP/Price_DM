export type DeckCardInput = {
  canonicalCardId: number;
  name: string;
  quantity: number;
};

export type DeckInput = {
  name: string;
  format: "original" | "advanced";
  visibility: "private" | "unlisted" | "public";
  description: string;
  cards: DeckCardInput[];
};

const formats = new Set(["original", "advanced"]);
const visibilities = new Set(["private", "unlisted", "public"]);

export function parseDeckInput(formData: FormData): DeckInput | null {
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
  if (!Array.isArray(parsed) || parsed.length > 40) return null;

  const ids = new Set<number>();
  const cards: DeckCardInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const canonicalCardId = candidate.canonicalCardId;
    const quantity = candidate.quantity;
    const cardName = candidate.name;
    if (
      typeof canonicalCardId !== "number" ||
      !Number.isSafeInteger(canonicalCardId) ||
      canonicalCardId <= 0 ||
      ids.has(canonicalCardId) ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 4 ||
      typeof cardName !== "string" ||
      cardName.trim().length < 1 ||
      cardName.trim().length > 200
    ) return null;
    ids.add(canonicalCardId);
    cards.push({ canonicalCardId, quantity, name: cardName.trim() });
  }

  if (cards.reduce((total, card) => total + card.quantity, 0) > 40) return null;

  return {
    name,
    format: formatValue as DeckInput["format"],
    visibility: visibilityValue as DeckInput["visibility"],
    description,
    cards,
  };
}
