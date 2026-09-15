import { PublicDeckSearch, type PublicDeckItem } from "@/components/public-deck-search";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { getDeckIconSelection } from "@/lib/deck-icon";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DeckSearchPage() {
  const supabase = createServerSupabaseClient();
  const { data: decks, error } = supabase
    ? await supabase.from("decks").select("id, owner_id, name, description, format, updated_at, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, quantity, zone, canonical_cards(name))").eq("visibility", "public").order("updated_at", { ascending: false }).limit(100)
    : { data: null, error: new Error("Supabase is not configured") };
  const ownerIds = [...new Set((decks ?? []).map((deck) => deck.owner_id))];
  const iconIds = [...new Set((decks ?? []).map((deck) => getDeckIconSelection(deck.deck_cards, deck.icon_canonical_card_id)?.canonicalCardId).filter((id): id is number => typeof id === "number"))];
  const [{ data: profiles }, { data: prints }] = await Promise.all([
    supabase && ownerIds.length
      ? supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
      : Promise.resolve({ data: [] }),
    supabase && iconIds.length
      ? supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", iconIds).not("image_key", "is", null).order("id")
      : Promise.resolve({ data: [] }),
  ]);
  const ownerNames = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name]));
  const images = new Map<number, string>();
  const printImages = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(prints ?? [])) if (print.image_key) {
    if (!images.has(print.canonical_card_id)) images.set(print.canonical_card_id, print.image_key);
    printImages.set(print.id, print.image_key);
  }
  const items: PublicDeckItem[] = (decks ?? []).map((deck) => {
    const main = deck.deck_cards.filter((card) => card.zone === "main");
    const icon = getDeckIconSelection(deck.deck_cards, deck.icon_canonical_card_id);
    const imageKey = icon ? (icon.cardPrintId ? printImages.get(icon.cardPrintId) : null) ?? images.get(icon.canonicalCardId) : null;
    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      format: deck.format,
      ownerName: ownerNames.get(deck.owner_id) ?? "公開ユーザー",
      cardNames: [...new Set(main.map((card) => card.canonical_cards?.name).filter((name): name is string => Boolean(name)))],
      cardCount: main.reduce((sum, card) => sum + card.quantity, 0),
      imageUrl: getCardImageUrl(imageKey),
      popularityScore: new Set(main.map((card) => card.canonical_cards?.name).filter(Boolean)).size * 100 + main.reduce((sum, card) => sum + card.quantity, 0),
      updatedAt: deck.updated_at,
    };
  });
  return <section className="directory-page deck-search-page"><div className="primary-page-title"><h1>デッキ検索</h1><p className="directory-lead">公開デッキを、デッキ名や収録カードから検索できます。</p><div className="directory-accent" aria-hidden="true" /></div>{error ? <p className="notice error">公開デッキを読み込めませんでした。</p> : <PublicDeckSearch decks={items} />}</section>;
}
