import "server-only";

import {
  mapCardDetailRows,
  type CardBestPrice,
  type CardDetail,
  type CardRecentRecord,
} from "./card-detail-data-mapping";
import { getCardImageUrl } from "./card-image";
import { pickCardPrintImageKey } from "./card-print-order";
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

  let summary = summaryResult.data;
  if (!summary) {
    const { data: canonical, error: canonicalError } = await supabase.from("canonical_cards")
      .select("id, name, name_kana, game_id, aliases, aliases_kana").eq("id", canonicalCardId).is("deleted_at", null).maybeSingle();
    if (canonicalError) return { card: null, error: "カードを読み込めませんでした。" };
    if (!canonical) return { card: null, error: null };
    const { data: game } = await supabase.from("tcg_games").select("name, slug").eq("id", canonical.game_id).maybeSingle();
    summary = {
      canonical_card_id: canonical.id, name: canonical.name, name_kana: canonical.name_kana,
      game_id: canonical.game_id, game_name: game?.name ?? null, game_slug: game?.slug ?? null,
      aliases: canonical.aliases, aliases_kana: canonical.aliases_kana, print_count: 0,
      sale_price: null, buy_price: null, sale_record_count: 0, buy_record_count: 0,
      sale_trend: null, buy_trend: null, stock_status: "unknown", last_observed_on: null,
      is_stale: false, uses_print_fallback: false,
    };
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

  const { data: prints, error: imageError } = await supabase
    .from("card_prints")
    .select("id, image_key, product_name, card_number, official_card_id")
    .eq("canonical_card_id", canonicalCardId)
    .not("image_key", "is", null)
    .is("deleted_at", null);
  if (imageError) {
    console.error("Failed to load card artwork", imageError);
  } else {
    card.imageUrl = getCardImageUrl(pickCardPrintImageKey(prints ?? []));
  }

  return {
    card,
    error:
      detailErrors.length > 0
        ? "一部の価格詳細を読み込めませんでした。"
        : null,
  };
}
