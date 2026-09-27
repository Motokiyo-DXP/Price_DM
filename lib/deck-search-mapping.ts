import { getCardImageUrl } from "./card-image.ts";
import type { CardPrintImageChoice } from "./card-print-order.ts";

export type DeckSearchCard = {
  id: number;
  name: string;
  name_kana: string | null;
  print_count: number;
  usage_count?: number;
  cost?: number | null;
  civilizations?: string[];
  cardTypes?: string[];
  imageUrl: string | null;
  imageOptions: { printId: number; url: string }[];
  productNames: string[];
  cardNumbers: string[];
  newestPrintId: number;
  hydrated?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mapDeckSearchResults(
  value: unknown,
  printRepresentativesById: ReadonlyMap<number, CardPrintImageChoice>,
  fallbackCosts: Readonly<Record<string, number>> = {},
): DeckSearchCard[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((row) => {
    if (!isRecord(row) || !Number.isSafeInteger(row.id) || typeof row.name !== "string") return [];

    const representative = printRepresentativesById.get(Number(row.id));
    const imageUrl = representative ? getCardImageUrl(representative.imageKey) : null;
    return [{
      id: Number(row.id),
      name: row.name,
      name_kana: typeof row.name_kana === "string" ? row.name_kana : null,
      print_count: typeof row.print_count === "number" ? row.print_count : 0,
      usage_count: typeof row.usage_count === "number" ? row.usage_count : undefined,
      cost: typeof row.cost === "number" ? row.cost : fallbackCosts[row.name],
      civilizations: Array.isArray(row.civilizations) ? row.civilizations.filter((item): item is string => typeof item === "string") : [],
      cardTypes: Array.isArray(row.card_types) ? row.card_types.filter((item): item is string => typeof item === "string") : [],
      imageUrl,
      imageOptions: representative && imageUrl ? [{ printId: representative.printId, url: imageUrl }] : [],
      productNames: [],
      cardNumbers: [],
      newestPrintId: representative?.printId ?? 0,
      hydrated: false,
    }];
  });
}
