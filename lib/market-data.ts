import "server-only";

import { unstable_cache } from "next/cache";
import { getCardImageUrl } from "./card-image";
import { sortCardPrintsOldestFirst } from "./card-print-order";
import { mapMarketSummaryRow } from "./market-data-mapping";
import { createServerSupabaseClient } from "./supabase";
import type { CardSummary } from "./types";

const MARKET_DATA_TIMEOUT_MS = 5_000;
export const MARKET_CARDS_CACHE_TAG = "market-cards";

async function fetchMarketCards(): Promise<CardSummary[]> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase connection is not configured.");
  }

  const summaryResult = await supabase
    .rpc("load_market_cards_with_images", { p_limit: 1000 })
    .abortSignal(AbortSignal.timeout(MARKET_DATA_TIMEOUT_MS));

  if (summaryResult.error) {
    throw summaryResult.error;
  }

  const cards = (summaryResult.data ?? [])
    .map((row) => {
      const card = mapMarketSummaryRow(row);
      if (card) card.imageUrl = getCardImageUrl(row.image_key);
      return card;
    })
    .filter((card): card is CardSummary => card !== null);

  const cardIds = cards.map((card) => Number(card.id));
  if (cardIds.length) {
    const printQueries = Array.from({ length: Math.ceil(cardIds.length / 100) }, (_, index) =>
      supabase.from("card_prints")
        .select("id, canonical_card_id, image_key, product_name, card_number, official_card_id")
        .in("canonical_card_id", cardIds.slice(index * 100, (index + 1) * 100))
        .not("image_key", "is", null).is("deleted_at", null)
        .order("id").abortSignal(AbortSignal.timeout(MARKET_DATA_TIMEOUT_MS)),
    );
    const [metadataResult, ...printResults] = await Promise.all([
      supabase.rpc("load_market_card_sort_metadata", { p_card_ids: cardIds })
        .abortSignal(AbortSignal.timeout(MARKET_DATA_TIMEOUT_MS)),
      ...printQueries,
    ]);
    if (!metadataResult.error) {
      const metadata = new Map((metadataResult.data ?? []).map((row) => [
        String(row.canonical_card_id), row,
      ]));
      for (const card of cards) {
        const row = metadata.get(card.id);
        card.allAccountsUpdatedAt = row?.all_accounts_updated_at ?? null;
        card.latestReleaseDate = row?.latest_release_date ?? null;
      }
    }
    const prints = printResults.flatMap(({ data }) => data ?? []);
    const oldestImages = new Map<number, string>();
    for (const print of sortCardPrintsOldestFirst(prints ?? [])) {
      if (print.image_key && !oldestImages.has(print.canonical_card_id)) oldestImages.set(print.canonical_card_id, print.image_key);
    }
    for (const card of cards) card.imageUrl = getCardImageUrl(oldestImages.get(Number(card.id))) ?? card.imageUrl;
  }

  return cards;
}

const loadMarketCardsCached = unstable_cache(
  fetchMarketCards,
  [MARKET_CARDS_CACHE_TAG],
  { revalidate: 300, tags: [MARKET_CARDS_CACHE_TAG] },
);

export async function loadMarketCards(): Promise<{
  cards: CardSummary[];
  error: string | null;
}> {
  try {
    return { cards: await loadMarketCardsCached(), error: null };
  } catch (error) {
    console.error("Failed to load market data from Supabase", error);
    return {
      cards: [],
      error: "相場データを読み込めませんでした。時間をおいて再度お試しください。",
    };
  }
}
