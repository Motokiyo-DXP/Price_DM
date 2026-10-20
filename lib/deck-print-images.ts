import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Stay below the Data API row limit and fetch every page before choosing artwork.
const PAGE_SIZE = 500;

export async function loadDeckCardPrints(supabase: SupabaseClient<Database>, canonicalCardIds: number[]) {
  const loadPage = (offset: number) => supabase.from("card_prints")
    .select("id, canonical_card_id, image_key, product_name, card_number, official_card_id")
    .in("canonical_card_id", canonicalCardIds)
    .not("image_key", "is", null)
    .order("id")
    .range(offset, offset + PAGE_SIZE - 1);
  const prints: NonNullable<Awaited<ReturnType<typeof loadPage>>["data"]> = [];
  if (!canonicalCardIds.length) return prints;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await loadPage(offset);
    if (error) throw new Error("デッキの画像情報を取得できませんでした。", { cause: error });
    prints.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return prints;
  }
}
