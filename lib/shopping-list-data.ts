import "server-only";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import type { ShoppingPriceRecord } from "@/lib/shopping-list";
import type { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export async function loadShoppingListData(supabase: NonNullable<Awaited<ReturnType<typeof createAuthServerSupabaseClient>>>, ids: number[]) {
  if (!ids.length) return { cards: [], records: [] };
  const [cardResult, printResult, priceResult] = await Promise.all([
    supabase.from("canonical_cards").select("id, name").in("id", ids).is("deleted_at", null),
    supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", ids).not("image_key", "is", null).is("deleted_at", null).order("id"),
    supabase.from("price_records").select("id, canonical_card_id, shop_id, sale_price, buy_price, card_print_id, observed_on, created_at").in("canonical_card_id", ids).is("deleted_at", null),
  ]);
  if (cardResult.error || printResult.error || priceResult.error) throw new Error("shopping_data_unavailable");
  const canonicalCards = cardResult.data, prints = printResult.data, priceRecords = priceResult.data;
  const shopIds = [...new Set((priceRecords ?? []).map((record) => record.shop_id))];
  const { data: shops, error: shopError } = shopIds.length ? await supabase.from("shops").select("id, name").in("id", shopIds) : { data: [], error: null };
  if (shopError) throw new Error("shopping_shops_unavailable");
  const shopNames = new Map((shops ?? []).map((shop) => [shop.id, shop.name]));
  const imageKeys = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key && !imageKeys.has(print.canonical_card_id)) imageKeys.set(print.canonical_card_id, print.image_key);
  const cardNames = new Map((canonicalCards ?? []).map((card) => [card.id, card.name]));
  const cards = ids.flatMap((id) => { const name = cardNames.get(id); return name ? [{ id, name, imageUrl: getCardImageUrl(imageKeys.get(id)) }] : []; });
  const records: ShoppingPriceRecord[] = (priceRecords ?? []).flatMap((record) => { const shopName = shopNames.get(record.shop_id); return shopName ? [{ canonicalCardId: record.canonical_card_id, shopId: record.shop_id, shopName, salePrice: record.sale_price, buyPrice: record.buy_price, cardPrintId: record.card_print_id, observedOn: record.observed_on, createdAt: record.created_at, id: record.id }] : []; });

  return { cards, records };
}
