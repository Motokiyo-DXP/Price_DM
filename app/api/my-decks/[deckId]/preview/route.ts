import { NextResponse } from "next/server";
import { getCardImageUrl } from "@/lib/card-image";
import { pickCardPrintImageKey } from "@/lib/card-print-order";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export async function GET(_request: Request, context: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await context.params;
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const { data: deck, error } = await supabase.from("decks")
    .select("name, deck_cards(canonical_card_id, card_print_id, quantity, sort_order, zone, canonical_cards(name))")
    .eq("id", deckId).eq("owner_id", userId).single();
  if (error || !deck) return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });

  const ids = [...new Set(deck.deck_cards.map((card) => card.canonical_card_id))];
  const { data: prints, error: printsError } = ids.length
    ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", ids).not("image_key", "is", null)
    : { data: [], error: null };
  if (printsError) return NextResponse.json({ error: "カード画像を読み込めませんでした。" }, { status: 500 });
  type Print = { id: number; canonical_card_id: number; image_key: string | null; product_name: string | null; card_number: string | null; official_card_id: string | null };
  const byCanonical = new Map<number, Print[]>();
  for (const print of prints ?? []) {
    const group = byCanonical.get(print.canonical_card_id) ?? [];
    group.push(print);
    byCanonical.set(print.canonical_card_id, group);
  }
  const cards = deck.deck_cards.toSorted((a, b) => a.sort_order - b.sort_order)
    .flatMap((card) => Array.from({ length: card.quantity }, () => ({
      zone: card.zone,
      name: card.canonical_cards?.name ?? "カード",
      imageUrl: getCardImageUrl(pickCardPrintImageKey(byCanonical.get(card.canonical_card_id) ?? [], card.card_print_id)),
    })));
  return NextResponse.json({ name: deck.name, cards }, { headers: { "Cache-Control": "private, max-age=60" } });
}
