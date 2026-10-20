import { createHash } from "node:crypto";
import { cache } from "react";
import { createServerSupabaseClient } from "./supabase";
import { isUuid, parseSharedDeck } from "./shared-deck";
import { getCardImageUrl } from "./card-image";
import { pickCardPrintImageKey } from "./card-print-order";
import { loadDeckCardPrints } from "./deck-print-images";

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
  const cards = deck.cards.filter(card => card.zone === "main").toSorted((a, b) =>
    Number(b.canonical_card_id === deck.icon_canonical_card_id) - Number(a.canonical_card_id === deck.icon_canonical_card_id) || a.sort_order - b.sort_order);
  const ids = [...new Set(cards.map(card => card.canonical_card_id))].slice(0, 6);
  const prints = await loadDeckCardPrints(supabase, ids).catch(() => []);
  const images = ids.map(id => getCardImageUrl(pickCardPrintImageKey(
    (prints ?? []).filter(print => print.canonical_card_id === id), cards.find(card => card.canonical_card_id === id)?.card_print_id,
  ))).filter((url): url is string => Boolean(url));
  const revision = createHash("sha256").update(JSON.stringify([deck, images])).digest("hex").slice(0, 20);
  return { name: deck.name, images, revision };
});
