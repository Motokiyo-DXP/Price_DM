import type { Json } from "@/lib/database.types";

export type SharedDeckCard = { canonical_card_id: number; card_print_id: number | null; zone: string; quantity: number; sort_order: number; name: string };
export type SharedDeck = { name: string; format: string; description: string; icon_canonical_card_id: number | null; cards: SharedDeckCard[] };

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseSharedDeck(value: Json | null): SharedDeck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.name !== "string" || typeof value.format !== "string" || typeof value.description !== "string"
    || (value.icon_canonical_card_id !== null && typeof value.icon_canonical_card_id !== "number") || !Array.isArray(value.cards)) return null;
  const cards = value.cards;
  if (!cards.every((card) => card && typeof card === "object" && !Array.isArray(card)
    && typeof card.canonical_card_id === "number" && (card.card_print_id === null || typeof card.card_print_id === "number")
    && typeof card.zone === "string" && typeof card.quantity === "number" && typeof card.sort_order === "number" && typeof card.name === "string")) return null;
  return value as SharedDeck;
}
