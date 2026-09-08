import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
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
  const cardIds = [...new Set((decks ?? []).flatMap((deck) => deck.deck_cards.filter((card) => card.zone === "main").map((card) => card.canonical_card_id)))];
  const { data: prints } = cardIds.length ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", cardIds).not("image_key", "is", null).order("id") : { data: [] };
  const images = new Map<number, string>();
  const printImages = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key) {
    if (!images.has(print.canonical_card_id)) images.set(print.canonical_card_id, print.image_key);
    printImages.set(print.id, print.image_key);
  }
  return <section className="directory-page solo-page">
    <h1>一人回し</h1>
    <p className="directory-lead">デッキを選んですぐに一人回しを始められます。</p>
    <div className="directory-accent" aria-hidden="true" />
    {error ? <p className="notice error">デッキを読み込めませんでした。</p> : <>
      <div className="solo-section-heading"><h2>デッキを選ぶ</h2><span>更新順</span></div>
      <div className="solo-deck-list">{(decks ?? []).map((deck, index) => {
        const main = deck.deck_cards.filter((card) => card.zone === "main");
        const count = main.reduce((sum, card) => sum + card.quantity, 0);
        const iconId = deck.icon_canonical_card_id ?? main[0]?.canonical_card_id;
        const iconCard = main.find((card) => card.canonical_card_id === iconId);
        const imageKey = iconCard ? (iconCard.card_print_id ? printImages.get(iconCard.card_print_id) : null) ?? images.get(iconCard.canonical_card_id) : iconId ? images.get(iconId) : null;
        const imageUrl = getCardImageUrl(imageKey);
        const [start, end] = deckGradients[index % deckGradients.length];
        const style = { "--solo-start": start, "--solo-end": end } as CSSProperties;
        return <Link aria-label={`${deck.name}で一人回しを開始`} href={`/playtest/${deck.id}`} key={deck.id} style={style}>
          {imageUrl ? <CardArtwork className="solo-deck-artwork" eager={index < 5} imageUrl={imageUrl} name={deck.name} sizes="(max-width: 560px) 50vw, 196px" /> : <span className="solo-deck-mark" aria-hidden="true">{deck.name.trim().charAt(0).toUpperCase() || "D"}</span>}
          <span className="solo-deck-shine" aria-hidden="true" />
          <span className="solo-deck-meta"><strong>{deck.name}</strong><small>{formatName(deck.format)}・{count}枚</small></span>
          <b aria-hidden="true">→</b>
        </Link>;
      })}</div>
    </>}
    {!error && !decks?.length ? <div className="history-empty"><strong>一人回しできるデッキがありません</strong><p>先にマイデッキからデッキを作成してください。</p></div> : null}
  </section>;
}
