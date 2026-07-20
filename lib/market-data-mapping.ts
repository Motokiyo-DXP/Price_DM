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
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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
    row.name.length === 0
  ) {
    return null;
  }

  return {
    id: String(row.canonical_card_id),
    game: row.game_name ?? "TCG 未設定",
    name: row.name,
    nameKana: row.name_kana ?? undefined,
    aliases: [...stringArray(row.aliases), ...stringArray(row.aliases_kana)],
    printCount: row.print_count ?? 0,
    salePrice: row.sale_price,
    buyPrice: row.buy_price,
    saleRecordCount: row.sale_record_count ?? 0,
    buyRecordCount: row.buy_record_count ?? 0,
    saleTrend: toTrend(row.sale_trend),
    buyTrend: toTrend(row.buy_trend),
    stock: isStockStatus(row.stock_status)
      ? STOCK_STATUS_LABELS[row.stock_status]
      : STOCK_STATUS_LABELS.unknown,
    updatedAt: row.last_observed_on,
    isStale: row.is_stale ?? false,
    usesPrintFallback: row.uses_print_fallback ?? false,
  };
}
