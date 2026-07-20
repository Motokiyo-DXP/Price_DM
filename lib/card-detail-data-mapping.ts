import type { Database } from "./database.types";
import { mapMarketSummaryRow } from "./market-data-mapping.ts";
import {
  STOCK_STATUS_LABELS,
  type CardPriceHistoryPoint,
  type CardSummary,
  type StockStatus,
} from "./types.ts";

type CardSummaryRow =
  Database["public"]["Views"]["canonical_card_market_summary"]["Row"];
type BestPriceRow =
  Database["public"]["Functions"]["get_canonical_card_best_prices"]["Returns"][number];
type PriceHistoryRow =
  Database["public"]["Functions"]["get_canonical_card_price_history"]["Returns"][number];
type RecentRecordRow =
  Database["public"]["Functions"]["get_canonical_card_recent_records"]["Returns"][number];

type BestPriceKind = "sale" | "buy";

export type CardBestPrice = {
  kind: BestPriceKind;
  price: number;
  shopName: string;
  observedOn: string;
  isStale: boolean;
  stock: string;
  cardNumber?: string;
  productName?: string;
  attributeNames: string[];
  hasCautionAttribute: boolean;
};

export type CardRecentRecord = {
  id: string;
  salePrice: number | null;
  buyPrice: number | null;
  stock: string;
  stockStatus: StockStatus;
  observedOn: string;
  isStale: boolean;
  shopName: string;
  cardNumber?: string;
  productName?: string;
  attributeNames: string[];
  note?: string;
};

export type CardDetail = CardSummary & {
  bestSale: CardBestPrice | null;
  bestBuy: CardBestPrice | null;
  priceHistory: CardPriceHistoryPoint[];
  recentRecords: CardRecentRecord[];
};

function isStockStatus(value: unknown): value is StockStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(STOCK_STATUS_LABELS, value)
  );
}

function stockStatus(value: unknown): StockStatus {
  return isStockStatus(value) ? value : "unknown";
}

function stockLabel(value: unknown): string {
  return STOCK_STATUS_LABELS[stockStatus(value)];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function nullablePrice(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function nonNegativeCount(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0;
}

export function mapBestPriceRow(row: BestPriceRow): CardBestPrice | null {
  if (
    (row.price_kind !== "sale" && row.price_kind !== "buy") ||
    nullablePrice(row.price) === null ||
    !isDateString(row.observed_on)
  ) {
    return null;
  }

  return {
    kind: row.price_kind,
    price: row.price,
    shopName: optionalString(row.shop_name) ?? "店舗未設定",
    observedOn: row.observed_on,
    isStale: row.is_stale === true,
    stock: stockLabel(row.stock_status),
    cardNumber: optionalString(row.card_number),
    productName: optionalString(row.product_name),
    attributeNames: stringArray(row.attribute_names),
    hasCautionAttribute: row.has_caution_attribute === true,
  };
}

export function mapPriceHistoryRow(
  row: PriceHistoryRow,
): CardPriceHistoryPoint | null {
  if (!isDateString(row.observed_on)) {
    return null;
  }

  const salePrice = nullablePrice(row.sale_price);
  const buyPrice = nullablePrice(row.buy_price);
  if (salePrice === null && buyPrice === null) {
    return null;
  }

  return {
    observedOn: row.observed_on,
    salePrice,
    buyPrice,
    saleRecordCount: nonNegativeCount(row.sale_record_count),
    buyRecordCount: nonNegativeCount(row.buy_record_count),
  };
}

export function mapRecentRecordRow(
  row: RecentRecordRow,
): CardRecentRecord | null {
  if (
    !Number.isSafeInteger(row.price_record_id) ||
    row.price_record_id <= 0 ||
    !isDateString(row.observed_on)
  ) {
    return null;
  }

  const normalizedStockStatus = stockStatus(row.stock_status);
  return {
    id: String(row.price_record_id),
    salePrice: nullablePrice(row.sale_price),
    buyPrice: nullablePrice(row.buy_price),
    stock: STOCK_STATUS_LABELS[normalizedStockStatus],
    stockStatus: normalizedStockStatus,
    observedOn: row.observed_on,
    isStale: row.is_stale === true,
    shopName: optionalString(row.shop_name) ?? "店舗未設定",
    cardNumber: optionalString(row.card_number),
    productName: optionalString(row.product_name),
    attributeNames: stringArray(row.attribute_names),
    note: optionalString(row.note),
  };
}

export function mapCardDetailRows(
  summaryRow: CardSummaryRow,
  bestPriceRows: BestPriceRow[],
  priceHistoryRows: PriceHistoryRow[],
  recentRecordRows: RecentRecordRow[],
): CardDetail | null {
  const summary = mapMarketSummaryRow(summaryRow);
  if (!summary) {
    return null;
  }

  const bestPrices = bestPriceRows
    .map(mapBestPriceRow)
    .filter((row): row is CardBestPrice => row !== null);

  return {
    ...summary,
    printCount: nonNegativeCount(summary.printCount),
    salePrice: nullablePrice(summary.salePrice),
    buyPrice: nullablePrice(summary.buyPrice),
    saleRecordCount: nonNegativeCount(summary.saleRecordCount),
    buyRecordCount: nonNegativeCount(summary.buyRecordCount),
    updatedAt: isDateString(summary.updatedAt) ? summary.updatedAt : null,
    bestSale: bestPrices.find((price) => price.kind === "sale") ?? null,
    bestBuy: bestPrices.find((price) => price.kind === "buy") ?? null,
    priceHistory: priceHistoryRows
      .map(mapPriceHistoryRow)
      .filter((row): row is CardPriceHistoryPoint => row !== null),
    recentRecords: recentRecordRows
      .map(mapRecentRecordRow)
      .filter((row): row is CardRecentRecord => row !== null),
  };
}
