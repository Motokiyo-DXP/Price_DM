"use client";

import { useEffect, useMemo, useState } from "react";
import { CardArtwork } from "@/components/card-artwork";
import { resolveCardArtworkUrl } from "@/lib/card-image";

type PreviewCard = { zone: string; name: string; imageUrl: string | null };
type DeckPreview = { name: string; cards: PreviewCard[] };
const previewCache = new Map<string, DeckPreview>();

function zoneName(zone: string) {
  if (zone === "gr") return "超GRゾーン";
  if (zone === "hyper" || zone === "super_dimensional") return "超次元ゾーン";
  return zone;
}

export function DeckPreviewModal({ deckId, deckName, scope, onClose }: { deckId: string; deckName: string; scope: "public" | "mine"; onClose: () => void }) {
  const cacheKey = `${scope}:${deckId}`;
  const [preview, setPreview] = useState<DeckPreview | null>(previewCache.get(cacheKey) ?? null);
  const [error, setError] = useState("");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  useEffect(() => {
    if (preview) return;
    let active = true;
    fetch(`/api/${scope === "mine" ? "my-decks" : "public-decks"}/${encodeURIComponent(deckId)}/preview`)
      .then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<DeckPreview>; })
      .then((data) => { previewCache.set(cacheKey, data); if (active) setPreview(data); })
      .catch(() => { if (active) setError("デッキを読み込めませんでした。"); });
    return () => { active = false; };
  }, [cacheKey, deckId, preview, scope]);
  const mainCards = preview?.cards.filter((card) => card.zone === "main").slice(0, 40) ?? [];
  const otherZones = useMemo(() => [...new Set(preview?.cards.filter((card) => card.zone !== "main").map((card) => card.zone) ?? [])], [preview]);
  const cardButton = (card: PreviewCard, index: number) => <button aria-label={`${card.name}を拡大`} key={index} onClick={(event) => { event.stopPropagation(); if (card.imageUrl) setExpandedImage(card.imageUrl); }} type="button"><CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 600px) 12vw, 100px" /></button>;

  return <>
    <div className="public-deck-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label={`${deckName}のデッキ確認`} aria-modal="true" className="public-deck-preview" role="dialog">
        <header><h2>{preview?.name ?? deckName}</h2><button aria-label="閉じる" onClick={onClose} type="button">×</button></header>
        {error ? <p role="alert">{error}</p> : null}
        {!preview && !error ? <p role="status">読み込み中…</p> : null}
        {preview ? <>
          <div className="public-deck-preview-grid">{Array.from({ length: 40 }, (_, index) => mainCards[index] ? cardButton(mainCards[index], index) : <span className="public-deck-preview-empty" key={index} />)}</div>
          <details onToggle={(event) => setOtherOpen(event.currentTarget.open)} open={otherOpen} className="public-deck-preview-other"><summary>その他</summary><div className="public-deck-preview-other-scroll">{otherZones.map((zone) => <section key={zone}><h3>{zoneName(zone)}</h3><div className="public-deck-preview-grid">{preview.cards.filter((card) => card.zone === zone).map(cardButton)}</div></section>)}</div></details>
        </> : null}
      </section>
    </div>
    {expandedImage ? <div aria-label="カード画像を閉じる" className="public-deck-image-backdrop" onClick={() => setExpandedImage(null)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setExpandedImage(null); }}><img alt="" draggable={false} src={resolveCardArtworkUrl(expandedImage)} /></div> : null}
  </>;
}
