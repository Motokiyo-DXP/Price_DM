import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { pickCardPrintImageKey } from "@/lib/card-print-order";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function OpponentDeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(`/playtest/${deckId}/opponent`)}`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect(`/login?next=${encodeURIComponent(`/playtest/${deckId}/opponent`)}`);

  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, name, format, deck_cards(card_print_id, quantity, sort_order, canonical_cards(name, card_prints(id, image_key, product_name, card_number, official_card_id)))")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error || !decks?.some((deck) => deck.id === deckId)) notFound();

  return (
    <section className="opponent-deck-page">
      <header>
        <Link className="back-link" href="/decks">← マイデッキ</Link>
        <div><p className="eyebrow">一人回し</p><h1>対戦相手のデッキを選択</h1><p>相手側の初期手札・シールド・山札に使用するデッキを選んでください。</p></div>
      </header>
      <div className="opponent-deck-list">
        {decks.map((deck) => {
          const count = deck.deck_cards.reduce((sum, card) => sum + card.quantity, 0);
          const firstDeckCard = [...deck.deck_cards].sort((a, b) => a.sort_order - b.sort_order)[0];
          const imageKey = pickCardPrintImageKey(firstDeckCard?.canonical_cards?.card_prints ?? [], firstDeckCard?.card_print_id);
          const format = deck.format === "advanced" ? "アドバンス" : deck.format === "duel_party" ? "デュエパーティ" : "オリジナル";
          return (
            <Link aria-disabled={count < 10} className={`opponent-deck-option ${count < 10 ? "disabled" : ""}`} href={count >= 10 ? `/playtest/${deckId}?opponent=${deck.id}` : "#"} key={deck.id}>
              <CardArtwork imageUrl={getCardImageUrl(imageKey)} name={deck.name} sizes="120px" />
              <span><strong>{deck.name}</strong><small>{format}・{count}枚{deck.id === deckId ? "・選択中のデッキ" : ""}</small></span>
              <b>{count >= 10 ? "選択 →" : "10枚未満"}</b>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
