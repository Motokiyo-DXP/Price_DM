import "server-only";

import {
  mapCardDetailRows,
  type CardBestPrice,
  type CardDetail,
  type CardRecentRecord,
} from "./card-detail-data-mapping";
import { createServerSupabaseClient } from "./supabase";
export type { CardBestPrice, CardDetail, CardRecentRecord };

export async function loadCardDetail(
  canonicalCardId: number,
  excludeCautionAttributes = false,
): Promise<{
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

  const [
    summaryResult,
    bestPricesResult,
    priceHistoryResult,
    recentRecordsResult,
  ] =
    await Promise.all([
      supabase
        .from("canonical_card_market_summary")
        .select("*")
        .eq("canonical_card_id", canonicalCardId)
        .maybeSingle(),
      supabase.rpc("get_canonical_card_best_prices", {
        p_canonical_card_id: canonicalCardId,
        p_exclude_caution_attributes: excludeCautionAttributes,
      }),
      supabase.rpc("get_canonical_card_price_history", {
        p_canonical_card_id: canonicalCardId,
        p_days: 180,
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
  if (!summary) {
    return { card: null, error: null };
  }

  const detailErrors = [
    bestPricesResult.error,
    priceHistoryResult.error,
    recentRecordsResult.error,
  ].filter(Boolean);
  if (detailErrors.length > 0) {
    console.error("Failed to load canonical card details", detailErrors);
  }

  const card = mapCardDetailRows(
    summary,
    bestPricesResult.data ?? [],
    priceHistoryResult.data ?? [],
    recentRecordsResult.data ?? [],
  );

  if (!card) {
    return { card: null, error: null };
  }

  return {
    card,
    error:
      detailErrors.length > 0
        ? "一部の価格詳細を読み込めませんでした。"
        : null,
  };
}
