import { notFound, redirect } from "next/navigation";
import { PlaytestBoard } from "@/components/playtest-board";
import { getCardImageUrl } from "@/lib/card-image";
import { pickCardPrintImageKey } from "@/lib/card-print-order";
import { initialOnlineBoard } from "@/lib/playfield-board";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { loadLocalCardMetadata } from "@/lib/local-card-metadata";

export const dynamic = "force-dynamic";

export default async function PlaytestPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ opponent?: string }>;
}) {
  const { deckId } = await params;
  const { opponent: opponentDeckId } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) notFound();
  if (opponentDeckId && !/^[0-9a-f-]{36}$/i.test(opponentDeckId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data: deck, error } = await supabase
    .from("decks")
    .select("id, name, format, deck_cards(canonical_card_id, card_print_id, quantity, sort_order, canonical_cards(name, cost, civilizations, card_types, card_prints(id, image_key, product_name, card_number, official_card_id)))")
    .eq("id", deckId)
    .eq("owner_id", claims.claims.sub)
    .single();
  if (error || !deck) notFound();

  const { data: opponentDeck, error: opponentError } = opponentDeckId
    ? await supabase
      .from("decks")
      .select("id, name, format, deck_cards(canonical_card_id, card_print_id, quantity, sort_order, canonical_cards(name, cost, civilizations, card_types, card_prints(id, image_key, product_name, card_number, official_card_id)))")
      .eq("id", opponentDeckId)
      .eq("owner_id", claims.claims.sub)
      .single()
    : { data: deck, error: null };
  if (opponentError || !opponentDeck) notFound();
  const localMetadata = await loadLocalCardMetadata();

  const cards = deck.deck_cards
    .map((item) => ({
      canonicalCardId: item.canonical_card_id,
      name: item.canonical_cards?.name ?? "名称未登録カード",
      quantity: item.quantity,
      sortOrder: item.sort_order,
      imageUrl: getCardImageUrl(pickCardPrintImageKey(item.canonical_cards?.card_prints ?? [], item.card_print_id)),
      cost: item.canonical_cards?.cost ?? localMetadata.get(item.canonical_cards?.name ?? "")?.cost,
      civilizations: item.canonical_cards?.civilizations?.length ? item.canonical_cards.civilizations : localMetadata.get(item.canonical_cards?.name ?? "")?.civilizations ?? [],
      cardTypes: item.canonical_cards?.card_types ?? [],
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const opponentCards = opponentDeck.deck_cards
    .map((item) => ({
      canonicalCardId: item.canonical_card_id,
      name: item.canonical_cards?.name ?? "名称未登録カード",
      quantity: item.quantity,
      sortOrder: item.sort_order,
      imageUrl: getCardImageUrl(pickCardPrintImageKey(item.canonical_cards?.card_prints ?? [], item.card_print_id)),
      cost: item.canonical_cards?.cost ?? localMetadata.get(item.canonical_cards?.name ?? "")?.cost,
      civilizations: item.canonical_cards?.civilizations?.length ? item.canonical_cards.civilizations : localMetadata.get(item.canonical_cards?.name ?? "")?.civilizations ?? [],
      cardTypes: item.canonical_cards?.card_types ?? [],
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const initialState = initialOnlineBoard(cards, opponentCards);

  return (
    <section className="playtest-page">
      <div className="playtest-page-heading">
        <p className="deck-versus"><span>{deck.name}</span><b>VS</b><span>{opponentDeck.name}</span></p>
      </div>
      <PlaytestBoard cards={cards} deckFormat={deck.format} deckName={deck.name} initialState={initialState} opponentCards={opponentCards} opponentDeckFormat={opponentDeck.format} opponentDeckName={opponentDeck.name} />
    </section>
  );
}
