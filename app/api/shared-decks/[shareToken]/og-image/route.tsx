import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDeckShareOgp } from "@/lib/deck-share-ogp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const deck = await getDeckShareOgp(shareToken);
  // Fetch only URLs built from trusted card image keys, never user-supplied URLs.
  const images = (await Promise.all((deck?.images ?? []).map(async url => {
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
      return `data:image/png;base64,${(await sharp(Buffer.from(bytes)).resize(250, 350, { fit: "contain" }).png().toBuffer()).toString("base64")}`;
    } catch { return null; }
  }))).filter((image): image is string => Boolean(image));
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#101c30", color: "white", padding: 48 }}>
      <div style={{ display: "flex", color: "#f3ce52", fontSize: 28 }}>DUEL MASTERS · DECK</div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        {images.length ? images.map((src, index) => <img key={index} src={src} alt="" width={Math.min(168, 1050 / images.length - 12)} height={250} style={{ objectFit: "contain" }} />) : <div style={{ display: "flex", fontSize: 56 }}>TCG DECK</div>}
      </div>
      <div style={{ display: "flex", fontSize: 42, height: 108, overflow: "hidden" }}>{deck && images.length ? deck.name.slice(0, 70) : "デュエル・マスターズ"}</div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
