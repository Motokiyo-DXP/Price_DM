import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlaytestBoard } from "@/components/playtest-board";
import { getCardImageUrl } from "@/lib/card-image";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function PlaytestPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data: deck, error } = await supabase
    .from("decks")
    .select("id, name, deck_cards(canonical_card_id, quantity, sort_order, canonical_cards(name, card_prints(id, image_key)))")
    .eq("id", deckId)
    .eq("owner_id", claims.claims.sub)
    .single();
  if (error || !deck) notFound();

  const cards = deck.deck_cards
    .map((item) => ({
      canonicalCardId: item.canonical_card_id,
      name: item.canonical_cards?.name ?? "名称未登録カード",
      quantity: item.quantity,
      sortOrder: item.sort_order,
      imageUrl: getCardImageUrl(item.canonical_cards?.card_prints.find((print) => print.image_key)?.image_key),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="playtest-page">
      <div className="playtest-page-heading">
        <Link className="back-link" href="/decks">← マイデッキ</Link>
        <p>一人回し・初期版</p>
      </div>
      <PlaytestBoard cards={cards} deckName={deck.name} />
    </section>
  );
}
