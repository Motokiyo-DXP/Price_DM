import "server-only";

import { createServerSupabaseClient } from "./supabase";
import {
  CardSummary,
  STOCK_STATUS_LABELS,
  StockStatus,
  Trend,
} from "./types";

function toTrend(value: string | null): Trend {
  return value === "up" || value === "down" || value === "same"
    ? value
    : "unknown";
}

export async function loadMarketCards(): Promise<{
  cards: CardSummary[];
  error: string | null;
}> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return {
      cards: [],
      error: "Supabase の接続情報が設定されていません。",
    };
  }

  const summaryResult = await supabase
    .from("canonical_card_market_summary")
    .select(
      "canonical_card_id, game_name, name, name_kana, aliases, aliases_kana, print_count, sale_price, buy_price, sale_record_count, buy_record_count, sale_trend, buy_trend, stock_status, last_observed_on, is_stale, uses_print_fallback",
    )
    .not("last_observed_on", "is", null)
    .order("last_observed_on", { ascending: false })
    .limit(100);

  if (summaryResult.error) {
    console.error(
      "Failed to load market data from Supabase",
      summaryResult.error,
    );
    return {
      cards: [],
      error: "相場データを読み込めませんでした。時間をおいて再度お試しください。",
    };
  }

  const cards = (summaryResult.data ?? [])
    .filter(
      (row): row is typeof row & { canonical_card_id: number; name: string } =>
        row.canonical_card_id !== null && row.name !== null,
    )
    .map<CardSummary>((row) => ({
      id: String(row.canonical_card_id),
      game: row.game_name ?? "TCG 未設定",
      name: row.name,
      nameKana: row.name_kana ?? undefined,
      aliases: [...(row.aliases ?? []), ...(row.aliases_kana ?? [])],
      printCount: row.print_count ?? 0,
      salePrice: row.sale_price,
      buyPrice: row.buy_price,
      saleRecordCount: row.sale_record_count ?? 0,
      buyRecordCount: row.buy_record_count ?? 0,
      saleTrend: toTrend(row.sale_trend),
      buyTrend: toTrend(row.buy_trend),
      stock: row.stock_status
        ? STOCK_STATUS_LABELS[row.stock_status as StockStatus]
        : STOCK_STATUS_LABELS.unknown,
      updatedAt: row.last_observed_on,
      isStale: row.is_stale ?? false,
      usesPrintFallback: row.uses_print_fallback ?? false,
    }));

  return { cards, error: null };
}
