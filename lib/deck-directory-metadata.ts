import type { Metadata } from "next";
import { getDeckShareOgp, shareOrigin, shareDescription } from "@/lib/deck-share-ogp";

export async function generateDeckDirectoryMetadata({ searchParams }: { searchParams: Promise<{ share?: string }> }): Promise<Metadata> {
  const { share } = await searchParams;
  const deck = await getDeckShareOgp(share);
  const title = deck?.name ?? "デッキ | TCG 相場チェッカー";
  const url = deck ? `${shareOrigin}/deck-search?share=${encodeURIComponent(share!)}` : `${shareOrigin}/deck-search`;
  const image = deck ? `${shareOrigin}/api/shared-decks/${encodeURIComponent(share!)}/og-image?v=${deck.revision}` : `${shareOrigin}/api/shared-decks/default/og-image`;
  return { title, description: shareDescription,
    openGraph: { title, description: shareDescription, url, type: "website", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description: shareDescription, images: [image] },
  };
}
