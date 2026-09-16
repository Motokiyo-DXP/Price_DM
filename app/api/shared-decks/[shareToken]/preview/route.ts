import { NextResponse } from "next/server";
import { getCardImageUrl } from "@/lib/card-image";
import { pickCardPrintImageKey } from "@/lib/card-print-order";
import { isUuid, parseSharedDeck } from "@/lib/shared-deck";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(_request: Request, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  if (!isUuid(shareToken)) return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "デッキを読み込めませんでした。" }, { status: 503 });
  const { data, error } = await supabase.rpc("get_shared_deck", { p_share_token: shareToken });
  const deck = error ? null : parseSharedDeck(data);
  if (!deck) return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });
  const ids = [...new Set(deck.cards.map((card) => card.canonical_card_id))];
  const { data: prints, error: printsError } = ids.length
    ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", ids).not("image_key", "is", null)
    : { data: [], error: null };
  if (printsError) return NextResponse.json({ error: "カード画像を読み込めませんでした。" }, { status: 500 });
  type Print = { id: number; canonical_card_id: number; image_key: string | null; product_name: string | null; card_number: string | null; official_card_id: string | null };
  const byCanonical = new Map<number, Print[]>();
  for (const print of prints ?? []) byCanonical.set(print.canonical_card_id, [...(byCanonical.get(print.canonical_card_id) ?? []), print]);
  const cards = deck.cards.flatMap((card) => Array.from({ length: card.quantity }, () => ({
    zone: card.zone,
    name: card.name,
    imageUrl: getCardImageUrl(pickCardPrintImageKey(byCanonical.get(card.canonical_card_id) ?? [], card.card_print_id)),
  })));
  return NextResponse.json({ name: deck.name, cards }, { headers: { "Cache-Control": "no-store" } });
}
