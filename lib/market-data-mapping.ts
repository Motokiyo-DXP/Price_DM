import type { Database } from "./database.types";
import {
  STOCK_STATUS_LABELS,
  type CardSummary,
  type StockStatus,
  type Trend,
} from "./types.ts";

type MarketSummaryRow =
  Omit<
    Database["public"]["Views"]["canonical_card_market_summary"]["Row"],
    "game_id" | "game_slug"
  >;

function toTrend(value: unknown): Trend {
  return value === "up" || value === "down" || value === "same"
    ? value
    : "unknown";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function nullableNonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function nonNegativeInteger(value: unknown): number {
  return nullableNonNegativeInteger(value) ?? 0;
}

function validDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

function isStockStatus(value: unknown): value is StockStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(STOCK_STATUS_LABELS, value)
  );
}

export function mapMarketSummaryRow(
  row: MarketSummaryRow,
): CardSummary | null {
  if (
    !Number.isSafeInteger(row.canonical_card_id) ||
    (row.canonical_card_id ?? 0) <= 0 ||
    typeof row.name !== "string" ||
    row.name.trim().length === 0
  ) {
    return null;
  }

  return {
    id: String(row.canonical_card_id),
    imageUrl: null,
    game: optionalString(row.game_name) ?? "TCG 未設定",
    name: row.name,
    nameKana: optionalString(row.name_kana),
    aliases: [...stringArray(row.aliases), ...stringArray(row.aliases_kana)],
    printCount: nonNegativeInteger(row.print_count),
    salePrice: nullableNonNegativeInteger(row.sale_price),
    buyPrice: nullableNonNegativeInteger(row.buy_price),
    saleRecordCount: nonNegativeInteger(row.sale_record_count),
    buyRecordCount: nonNegativeInteger(row.buy_record_count),
    saleTrend: toTrend(row.sale_trend),
    buyTrend: toTrend(row.buy_trend),
    stock: isStockStatus(row.stock_status)
      ? STOCK_STATUS_LABELS[row.stock_status]
      : STOCK_STATUS_LABELS.unknown,
    updatedAt: validDateOrNull(row.last_observed_on),
    isStale: row.is_stale === true,
    usesPrintFallback: row.uses_print_fallback === true,
  };
}
