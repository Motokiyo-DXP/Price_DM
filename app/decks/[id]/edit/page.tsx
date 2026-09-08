import { notFound, redirect } from "next/navigation";
import { DeckEditor, type DeckEditorInitialData } from "@/components/deck-editor";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { resolveLocalCardMetadata } from "@/lib/local-card-metadata";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=/decks/${id}/edit`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect(`/login?next=/decks/${id}/edit`);

  const { data: deck } = await supabase.from("decks")
    .select("id, name, format, visibility, description, deck_cards(canonical_card_id, card_print_id, quantity, sort_order, zone, canonical_cards(name, cost))")
    .eq("id", id).eq("owner_id", userId).maybeSingle();
  if (!deck) notFound();

  const mainCards = deck.deck_cards.filter((card) => card.zone === "main").sort((a, b) => a.sort_order - b.sort_order);
  const cardIds = mainCards.map((card) => card.canonical_card_id);
  const { data: prints } = cardIds.length ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", cardIds).not("image_key", "is", null).order("id") : { data: [] };
  const firstImages = new Map<number, string>();
  const printImages = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key) { printImages.set(print.id, print.image_key); if (!firstImages.has(print.canonical_card_id)) firstImages.set(print.canonical_card_id, print.image_key); }
  const format = deck.format === "advanced" || deck.format === "duel_party" ? deck.format : "original";
  const visibility = deck.visibility === "public" || deck.visibility === "unlisted" ? deck.visibility : "private";
  const localMetadata = await resolveLocalCardMetadata(mainCards.map((card) => card.canonical_cards?.name ?? ""));
  const fallbackCosts = Object.fromEntries([...localMetadata].flatMap(([name, metadata]) => metadata.cost === null ? [] : [[name, metadata.cost]]));
  const initialDeck: DeckEditorInitialData = {
    id: deck.id,
    name: deck.name,
    format,
    visibility,
    description: deck.description,
    cards: mainCards.map((card) => ({ canonicalCardId: card.canonical_card_id, cardPrintId: card.card_print_id, name: card.canonical_cards?.name ?? "カード", quantity: card.quantity, imageUrl: getCardImageUrl((card.card_print_id ? printImages.get(card.card_print_id) : null) ?? firstImages.get(card.canonical_card_id)), cost: card.canonical_cards?.cost ?? localMetadata.get(card.canonical_cards?.name ?? "")?.cost })),
  };
  return <section className="deck-editor-page"><DeckEditor fallbackCosts={fallbackCosts} initialDeck={initialDeck} /></section>;
}
