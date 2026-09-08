import { getCardImageUrl } from "./card-image.ts";
import { STOCK_STATUS_LABELS, type CardSummary } from "./types.ts";

type PricedCardsById = ReadonlyMap<string, CardSummary>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isDisplayText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function mapMarketSearchResults(
  value: unknown,
  pricedCardsById: PricedCardsById,
): CardSummary[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((row) => {
    if (
      !isRecord(row) ||
      !isPositiveId(row.id) ||
      !isDisplayText(row.name, 300) ||
      !isDisplayText(row.game_name, 100) ||
      !isNonNegativeInteger(row.print_count)
    ) {
      return [];
    }

    const id = String(row.id);
    const pricedCard = pricedCardsById.get(id);
    if (pricedCard) {
      return [
        {
          ...pricedCard,
          imageUrl:
            pricedCard.imageUrl ??
            (typeof row.image_key === "string"
              ? getCardImageUrl(row.image_key)
              : null),
        },
      ];
    }

    return [
      {
        id,
        imageUrl: typeof row.image_key === "string" ? getCardImageUrl(row.image_key) : null,
        game: row.game_name,
        name: row.name,
        nameKana:
          typeof row.name_kana === "string" && row.name_kana.trim().length > 0
            ? row.name_kana
            : undefined,
        aliases: [],
        printCount: row.print_count,
        salePrice: null,
        buyPrice: null,
        saleRecordCount: 0,
        buyRecordCount: 0,
        saleTrend: "unknown",
        buyTrend: "unknown",
        stock: STOCK_STATUS_LABELS.unknown,
        updatedAt: null,
        isStale: false,
        usesPrintFallback: false,
      },
    ];
  });
}
