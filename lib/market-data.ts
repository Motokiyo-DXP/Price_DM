import "server-only";

import { mapMarketSummaryRow } from "./market-data-mapping";
import { createServerSupabaseClient } from "./supabase";
import type { CardSummary } from "./types";

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
    .map(mapMarketSummaryRow)
    .filter((card): card is CardSummary => card !== null);

  return { cards, error: null };
}
