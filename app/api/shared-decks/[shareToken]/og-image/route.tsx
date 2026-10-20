import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDeckShareOgp } from "@/lib/deck-share-ogp";
import { getDeckShareImageLayout, previewArea } from "@/lib/deck-share-image-layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const deck = await getDeckShareOgp(shareToken);
  // Fetch only URLs built from trusted card image keys, never user-supplied URLs.
  const urls = [...new Set([deck?.iconImage, ...(deck?.cards.map(card => card.imageUrl) ?? [])].filter((url): url is string => Boolean(url)))];
  const artwork = new Map<string, string | null>();
  const loadArtwork = async (url: string) => {
    try {
      const base = process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL || "/cards";
      const source = url.startsWith("/cards/") ? base.replace(/\/$/, "") + url.slice(6) : url;
      let bytes: Uint8Array;
      if (source.startsWith("/")) {
        // Local /cards configuration works without a public server or self-fetch.
        bytes = await readFile(join(process.cwd(), "public", decodeURIComponent(source)));
      } else {
        const response = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok) return null;
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      if (bytes.byteLength > 5_000_000) return null;
      // Normalize WebP and handle corrupt images before rendering the response.
      const { default: sharp } = await import("sharp");
      return `data:image/png;base64,${(await sharp(Buffer.from(bytes)).resize(350, 490, { fit: "inside", withoutEnlargement: true }).png().toBuffer()).toString("base64")}`;
    } catch { return null; }
  };
  // Repeated copies share one download/decode; bound simultaneous remote requests.
  for (let offset = 0; offset < urls.length; offset += 6) {
    await Promise.all(urls.slice(offset, offset + 6).map(async url => artwork.set(url, await loadArtwork(url))));
  }
  const visibleDeck = [...artwork.values()].some(Boolean) ? deck : null;
  const cards = visibleDeck?.cards ?? [];
  const iconImage = visibleDeck?.iconImage ? artwork.get(visibleDeck.iconImage) : null;
  const layout = getDeckShareImageLayout(cards.length);
  const mainCount = cards.filter(card => card.zone === "main").length;
  const title = visibleDeck?.name ?? "デュエル・マスターズ";
  const label = title.length > 28 ? title.slice(0, 27) + "…" : title;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#0b1423", color: "white", padding: 24, gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", width: 390, height: 582, padding: 20, borderRadius: 18, background: "#1c304b" }}>
        <div style={{ display: "flex", color: "#f3ce52", fontSize: 20, height: 26 }}>DUEL MASTERS · DECK</div>
        <div style={{ display: "flex", width: 350, height: 390, marginTop: 12, alignItems: "center", justifyContent: "center" }}>
          {iconImage ? <img src={iconImage} alt="" width={350} height={390} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex", width: 280, height: 360, borderRadius: 12, background: "#293e5b", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#a8bdd8" }}>NO ICON</div>}
        </div>
        <div style={{ display: "flex", fontSize: 28, lineHeight: 1.15, height: 100, marginTop: 14, overflow: "hidden", alignItems: "center" }}>{label}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: 742, height: 582, padding: 16, borderRadius: 18, background: "#122036" }}>
        <div style={{ display: "flex", justifyContent: "space-between", height: 28, fontSize: 22, color: "#d9e7f8" }}><span>DECK LIST</span><span>{mainCount} CARDS{cards.length > mainCount ? ` + ${cards.length - mainCount} EXTRA` : ""}</span></div>
        <div style={{ display: "flex", position: "relative", width: previewArea.width, height: previewArea.height, marginTop: 12 }}>
          {cards.length ? cards.map((card, index) => {
            const src = card.imageUrl ? artwork.get(card.imageUrl) : null;
            return <div key={index} style={{ display: "flex", position: "absolute", ...layout.cells[index], width: layout.cardWidth, height: layout.cardHeight, alignItems: "center", justifyContent: "center", background: card.zone === "main" ? "#24364f" : "#4c405b", borderRadius: 3 }}>
              {src ? <img src={src} alt="" width={layout.cardWidth - 2} height={layout.cardHeight - 2} style={{ objectFit: "contain" }} /> : <span style={{ color: "#a8bdd8", fontSize: 18 }}>?</span>}
            </div>;
          }) : <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 42, color: "#a8bdd8" }}>DECK PREVIEW</div>}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
