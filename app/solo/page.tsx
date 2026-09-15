import { redirect } from "next/navigation";
import { SoloDeckPicker, type SoloDeckOption } from "@/components/solo-deck-picker";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { getDeckIconSelection } from "@/lib/deck-icon";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const deckGradients = [
  ["#0a6b8f", "#0a2933"],
  ["#945e14", "#291a4a"],
  ["#d6300d", "#420d14"],
  ["#0f73d9", "#081a45"],
  ["#b8bfc7", "#3d4f7a"],
  ["#751430", "#143859"],
  ["#eb5708", "#4d140a"],
  ["#2e944d", "#a85c14"],
  ["#db380a", "#0a61bd"],
  ["#0f70c2", "#293b4a"],
] as const;

function formatName(format: string) {
  if (format === "advanced") return "アドバンス";
  if (format === "duel_party") return "デュエパーティ";
  return "オリジナル";
}

export default async function SoloPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/solo");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login?next=/solo");
  const { data: decks, error } = await supabase.from("decks").select("id, name, format, updated_at, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, quantity, zone)").eq("owner_id", userId).order("updated_at", { ascending: false });
  const iconIds = [...new Set((decks ?? []).map((deck) => getDeckIconSelection(deck.deck_cards, deck.icon_canonical_card_id)?.canonicalCardId).filter((id): id is number => typeof id === "number"))];
  const { data: prints } = iconIds.length ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", iconIds).not("image_key", "is", null).order("id") : { data: [] };
  const images = new Map<number, string>();
  const printImages = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key) {
    if (!images.has(print.canonical_card_id)) images.set(print.canonical_card_id, print.image_key);
    printImages.set(print.id, print.image_key);
  }
  const deckOptions: SoloDeckOption[] = (decks ?? []).map((deck, index) => {
    const main = deck.deck_cards.filter((card) => card.zone === "main");
    const count = main.reduce((sum, card) => sum + card.quantity, 0);
    const icon = getDeckIconSelection(deck.deck_cards, deck.icon_canonical_card_id);
    const imageKey = icon ? (icon.cardPrintId ? printImages.get(icon.cardPrintId) : null) ?? images.get(icon.canonicalCardId) : null;
    const [start, end] = deckGradients[index % deckGradients.length];
    return { id: deck.id, name: deck.name, formatName: formatName(deck.format), count, imageUrl: getCardImageUrl(imageKey), start, end };
  });
  return <section className="directory-page solo-page">
    <div className="primary-page-title">
      <h1>ひとり回し</h1>
      <p className="directory-lead">デッキを選んですぐにひとり回しを始められます。</p>
      <div className="directory-accent" aria-hidden="true" />
    </div>
    {error ? <p className="notice error">デッキを読み込めませんでした。</p> : <>
      <SoloDeckPicker decks={deckOptions} />
    </>}
    {!error && !decks?.length ? <div className="history-empty"><strong>ひとり回しできるデッキがありません</strong><p>先にマイデッキからデッキを作成してください。</p></div> : null}
  </section>;
}
