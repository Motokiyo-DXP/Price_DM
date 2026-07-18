import "server-only";

import { createServerSupabaseClient } from "./supabase";
import {
  STOCK_STATUS_LABELS,
  type CardSummary,
  type StockStatus,
  type Trend,
} from "./types";

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
  recentRecords: CardRecentRecord[];
};

function toTrend(value: string | null): Trend {
  return value === "up" || value === "down" || value === "same"
    ? value
    : "unknown";
}

function stockLabel(value: StockStatus | null): string {
  return value ? STOCK_STATUS_LABELS[value] : STOCK_STATUS_LABELS.unknown;
}

export async function loadCardDetail(canonicalCardId: number): Promise<{
  card: CardDetail | null;
  error: string | null;
}> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return {
      card: null,
      error: "Supabase の接続情報が設定されていません。",
    };
  }

  const [summaryResult, bestPricesResult, recentRecordsResult] =
    await Promise.all([
      supabase
        .from("canonical_card_market_summary")
        .select("*")
        .eq("canonical_card_id", canonicalCardId)
        .maybeSingle(),
      supabase.rpc("get_canonical_card_best_prices", {
        p_canonical_card_id: canonicalCardId,
        p_exclude_caution_attributes: false,
      }),
      supabase.rpc("get_canonical_card_recent_records", {
        p_canonical_card_id: canonicalCardId,
        p_limit: 20,
      }),
    ]);

  if (summaryResult.error) {
    console.error("Failed to load canonical card summary", summaryResult.error);
    return {
      card: null,
      error: "カード相場を読み込めませんでした。時間をおいて再度お試しください。",
    };
  }

  const summary = summaryResult.data;
  if (!summary?.canonical_card_id || !summary.name) {
    return { card: null, error: null };
  }

  const detailErrors = [bestPricesResult.error, recentRecordsResult.error].filter(
    Boolean,
  );
  if (detailErrors.length > 0) {
    console.error("Failed to load canonical card details", detailErrors);
  }

  const bestPrices = (bestPricesResult.data ?? [])
    .filter(
      (row): row is typeof row & { price_kind: BestPriceKind } =>
        row.price_kind === "sale" || row.price_kind === "buy",
    )
    .map<CardBestPrice>((row) => ({
      kind: row.price_kind,
      price: row.price,
      shopName: row.shop_name,
      observedOn: row.observed_on,
      isStale: row.is_stale,
      stock: stockLabel(row.stock_status),
      cardNumber: row.card_number ?? undefined,
      productName: row.product_name ?? undefined,
      attributeNames: row.attribute_names ?? [],
      hasCautionAttribute: row.has_caution_attribute,
    }));

  const recentRecords = (recentRecordsResult.data ?? []).map<CardRecentRecord>(
    (row) => ({
      id: String(row.price_record_id),
      salePrice: row.sale_price ?? null,
      buyPrice: row.buy_price ?? null,
      stock: stockLabel(row.stock_status),
      observedOn: row.observed_on,
      isStale: row.is_stale,
      shopName: row.shop_name,
      cardNumber: row.card_number ?? undefined,
      productName: row.product_name ?? undefined,
      attributeNames: row.attribute_names ?? [],
      note: row.note ?? undefined,
    }),
  );

  const card: CardDetail = {
    id: String(summary.canonical_card_id),
    game: summary.game_name ?? "TCG 未設定",
    name: summary.name,
    nameKana: summary.name_kana ?? undefined,
    aliases: [...(summary.aliases ?? []), ...(summary.aliases_kana ?? [])],
    printCount: summary.print_count ?? 0,
    salePrice: summary.sale_price,
    buyPrice: summary.buy_price,
    saleRecordCount: summary.sale_record_count ?? 0,
    buyRecordCount: summary.buy_record_count ?? 0,
    saleTrend: toTrend(summary.sale_trend),
    buyTrend: toTrend(summary.buy_trend),
    stock: stockLabel(summary.stock_status),
    updatedAt: summary.last_observed_on,
    isStale: summary.is_stale ?? false,
    usesPrintFallback: summary.uses_print_fallback ?? false,
    bestSale: bestPrices.find((price) => price.kind === "sale") ?? null,
    bestBuy: bestPrices.find((price) => price.kind === "buy") ?? null,
    recentRecords,
  };

  return {
    card,
    error:
      detailErrors.length > 0
        ? "一部の価格詳細を読み込めませんでした。"
        : null,
  };
}
