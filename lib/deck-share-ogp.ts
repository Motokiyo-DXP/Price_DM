import { createHash } from "node:crypto";
import { cache } from "react";
import { createServerSupabaseClient } from "./supabase";
import { isUuid, parseSharedDeck } from "./shared-deck";
import { getCardImageUrl } from "./card-image";
import { pickCardPrintImageKey } from "./card-print-order";
import { loadDeckCardPrints } from "./deck-print-images";
import { getDeckIconSelection } from "./deck-icon";
import { expandDeckShareCards } from "./deck-share-image-layout";

export const shareOrigin = "https://dm-price-tracker.vercel.app";
export const shareDescription = "デュエル・マスターズのデッキをチェック";

// Request-scoped only: never retain visibility or deck contents between requests.
export const getDeckShareOgp = cache(async (token: string | undefined) => {
  if (!isUuid(token)) return null;
  const supabase = createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_shared_deck", { p_share_token: token });
  const deck = error ? null : parseSharedDeck(data);
  if (!deck) return null;
  const icon = getDeckIconSelection(deck.cards, deck.icon_canonical_card_id);
  const ids = [...new Set([...deck.cards.map(card => card.canonical_card_id), ...(icon ? [icon.canonicalCardId] : [])])];
  const prints = await loadDeckCardPrints(supabase, ids).catch(() => []);
  const imageFor = (id: number, printId: number | null) => getCardImageUrl(pickCardPrintImageKey(
    prints.filter(print => print.canonical_card_id === id), printId,
  ));
  const cards = expandDeckShareCards(deck.cards).map(card => ({
    name: card.name, zone: card.zone, imageUrl: imageFor(card.canonical_card_id, card.card_print_id),
  }));
  const iconImage = icon ? imageFor(icon.canonicalCardId, icon.cardPrintId) : null;
  // Include the renderer version so existing SNS image URLs also change on layout updates.
  const revision = createHash("sha256").update(JSON.stringify(["two-column-v1", deck, iconImage, cards])).digest("hex").slice(0, 20);
  return { name: deck.name, iconImage, cards, revision };
});
