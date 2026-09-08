import { redirect } from "next/navigation";
import { ShoppingListView } from "@/components/shopping-list-view";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import type { ShoppingPriceRecord } from "@/lib/shopping-list";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function ShoppingListPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/shopping-list");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login?next=/shopping-list");

  const { data: bookmarks, error: bookmarkError } = await supabase.from("account_card_bookmarks").select("canonical_card_id, created_at").order("created_at", { ascending: false });
  if (bookmarkError) return <div className="shopping-list-page"><p className="notice error">買い物リストを読み込めませんでした。</p></div>;
  const ids = (bookmarks ?? []).map((bookmark) => bookmark.canonical_card_id);
  if (!ids.length) return <ShoppingListView cards={[]} records={[]} />;

  const [{ data: canonicalCards }, { data: prints }, { data: priceRecords }] = await Promise.all([
    supabase.from("canonical_cards").select("id, name").in("id", ids).is("deleted_at", null),
    supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", ids).not("image_key", "is", null).is("deleted_at", null).order("id"),
    supabase.from("price_records").select("id, canonical_card_id, shop_id, sale_price, buy_price, card_print_id, observed_on, created_at").in("canonical_card_id", ids).is("deleted_at", null),
  ]);
  const shopIds = [...new Set((priceRecords ?? []).map((record) => record.shop_id))];
  const { data: shops } = shopIds.length ? await supabase.from("shops").select("id, name").in("id", shopIds) : { data: [] };
  const shopNames = new Map((shops ?? []).map((shop) => [shop.id, shop.name]));
  const imageKeys = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key && !imageKeys.has(print.canonical_card_id)) imageKeys.set(print.canonical_card_id, print.image_key);
  const cardNames = new Map((canonicalCards ?? []).map((card) => [card.id, card.name]));
  const cards = ids.flatMap((id) => { const name = cardNames.get(id); return name ? [{ id, name, imageUrl: getCardImageUrl(imageKeys.get(id)) }] : []; });
  const records: ShoppingPriceRecord[] = (priceRecords ?? []).flatMap((record) => { const shopName = shopNames.get(record.shop_id); return shopName ? [{ canonicalCardId: record.canonical_card_id, shopId: record.shop_id, shopName, salePrice: record.sale_price, buyPrice: record.buy_price, cardPrintId: record.card_print_id, observedOn: record.observed_on, createdAt: record.created_at, id: record.id }] : []; });

  return <ShoppingListView cards={cards} records={records} />;
}
