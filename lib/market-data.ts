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

  const [summaryResult, gamesResult] = await Promise.all([
    supabase
      .from("card_price_summary")
      .select(
        "card_id, game_id, name, card_number, product_name, sale_price, buy_price, sale_trend, buy_trend, stock_status, last_observed_on, is_stale, shop_name",
      )
      .order("name"),
    supabase.from("tcg_games").select("id, name"),
  ]);

  if (summaryResult.error || gamesResult.error) {
    console.error(
      "Failed to load market data from Supabase",
      summaryResult.error ?? gamesResult.error,
    );
    return {
      cards: [],
      error: "相場データを読み込めませんでした。時間をおいて再度お試しください。",
    };
  }

  const gameNames = new Map(
    (gamesResult.data ?? []).map((game) => [game.id, game.name]),
  );

  const cards = (summaryResult.data ?? [])
    .filter(
      (row): row is typeof row & { card_id: number; name: string } =>
        row.card_id !== null && row.name !== null,
    )
    .map<CardSummary>((row) => ({
      id: String(row.card_id),
      game:
        (row.game_id === null ? undefined : gameNames.get(row.game_id)) ??
        "TCG 未設定",
      name: row.name,
      setCode: row.card_number ?? undefined,
      productName: row.product_name ?? undefined,
      salePrice: row.sale_price,
      buyPrice: row.buy_price,
      saleTrend: toTrend(row.sale_trend),
      buyTrend: toTrend(row.buy_trend),
      stock: row.stock_status
        ? STOCK_STATUS_LABELS[row.stock_status as StockStatus]
        : STOCK_STATUS_LABELS.unknown,
      updatedAt: row.last_observed_on,
      isStale: row.is_stale ?? false,
      shopName: row.shop_name ?? undefined,
    }));

  return { cards, error: null };
}
