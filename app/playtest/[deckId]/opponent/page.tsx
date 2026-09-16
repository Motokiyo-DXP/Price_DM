import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { getDeckIconSelection } from "@/lib/deck-icon";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function OpponentDeckPage({ params, searchParams }: { params: Promise<{ deckId: string }>; searchParams: Promise<{ source?: string }> }) {
  const { deckId } = await params;
  const { source } = await searchParams;
  const isPublicSource = source === "public";
  const nextUrl = `/playtest/${deckId}/opponent${isPublicSource ? "?source=public" : ""}`;
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(nextUrl)}`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect(`/login?next=${encodeURIComponent(nextUrl)}`);

  if (isPublicSource) {
    const { data: sourceDeck, error: sourceError } = await supabase.from("decks").select("id").eq("id", deckId).eq("visibility", "public").single();
    if (sourceError || !sourceDeck) notFound();
  }

  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, name, format, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, quantity, zone)")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error || (!isPublicSource && !decks?.some((deck) => deck.id === deckId))) notFound();
  const iconIds = [...new Set((decks ?? []).map((deck) => getDeckIconSelection(deck.deck_cards, deck.icon_canonical_card_id)?.canonicalCardId).filter((id): id is number => typeof id === "number"))];
  const { data: prints } = iconIds.length ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", iconIds).not("image_key", "is", null).order("id") : { data: [] };
  const images = new Map<number, string>();
  const printImages = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key) {
    if (!images.has(print.canonical_card_id)) images.set(print.canonical_card_id, print.image_key);
    printImages.set(print.id, print.image_key);
  }

  return (
    <section className="opponent-deck-page">
      <header>
        <Link className="back-link" href="/decks">← マイデッキ</Link>
        <div><p className="eyebrow">ひとり回し</p><h1>対戦相手のデッキを選択</h1><p>相手側の初期手札・シールド・山札に使用するデッキを選んでください。</p></div>
      </header>
      <div className="opponent-deck-list">
        {decks.map((deck) => {
          const count = deck.deck_cards.reduce((sum, card) => sum + card.quantity, 0);
          const icon = getDeckIconSelection(deck.deck_cards, deck.icon_canonical_card_id);
          const imageKey = icon ? (icon.cardPrintId ? printImages.get(icon.cardPrintId) : null) ?? images.get(icon.canonicalCardId) : null;
          const format = deck.format === "advanced" ? "アドバンス" : deck.format === "duel_party" ? "デュエパーティ" : "オリジナル";
          return (
            <Link aria-disabled={count < 10} className={`opponent-deck-option ${count < 10 ? "disabled" : ""}`} href={count >= 10 ? `/playtest/${deckId}?opponent=${deck.id}${isPublicSource ? "&source=public" : ""}` : "#"} key={deck.id}>
              <CardArtwork imageUrl={getCardImageUrl(imageKey)} name={deck.name} sizes="120px" />
              <span><strong>{deck.name}</strong><small>{format}・{count}枚{!isPublicSource && deck.id === deckId ? "・選択中のデッキ" : ""}</small></span>
              <b>{count >= 10 ? "選択 →" : "10枚未満"}</b>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
