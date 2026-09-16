"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { importPublicDeckAction, importSharedDeckAction } from "@/app/decks/actions";
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

export type PublicDeckItem = {
  id: string;
  name: string;
  description: string;
  format: string;
  ownerName: string;
  cardNames: string[];
  cardCount: number;
  imageUrl: string | null;
  popularityScore: number;
  updatedAt: string;
};

function formatName(format: string) {
  if (format === "advanced") return "アドバンス";
  if (format === "duel_party") return "デュエパーティ";
  return "オリジナル";
}

export function PublicDeckSearch({ decks, shareToken }: { decks: PublicDeckItem[]; shareToken: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<"popular" | "updated">("popular");
  const [selected, setSelected] = useState<PublicDeckItem | null>(null);
  const [preview, setPreview] = useState<DeckPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const selectedId = useRef<string | null>(null);
  const [sharedOpen, setSharedOpen] = useState(false);
  useEffect(() => {
    if (!shareToken) return;
    let active = true;
    selectedId.current = shareToken;
    setSharedOpen(true);
    setSelected({ id: shareToken, name: "共有デッキ", description: "", format: "", ownerName: "", cardNames: [], cardCount: 0, imageUrl: null, popularityScore: 0, updatedAt: "" });
    setPreview(null);
    setPreviewError("");
    setOtherOpen(false);
    fetch(`/api/shared-decks/${encodeURIComponent(shareToken)}/preview`).then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<DeckPreview>;
    }).then((data) => { if (active && selectedId.current === shareToken) setPreview(data); }).catch(() => { if (active && selectedId.current === shareToken) setPreviewError("デッキを読み込めませんでした。"); });
    return () => { active = false; };
  }, [shareToken]);
  function closePreview() {
    selectedId.current = null;
    setSelected(null);
    setExpandedImage(null);
    if (sharedOpen) { setSharedOpen(false); router.replace("/deck-search"); }
  }
  const otherZones = useMemo(() => [...new Set(preview?.cards.filter((card) => card.zone !== "main").map((card) => card.zone) ?? [])], [preview]);
  const mainCards = preview?.cards.filter((card) => card.zone === "main").slice(0, 40) ?? [];
  async function openPreview(deck: PublicDeckItem) {
    setSharedOpen(false);
    selectedId.current = deck.id;
    setSelected(deck);
    setPreview(previewCache.get(deck.id) ?? null);
    setPreviewError("");
    setOtherOpen(false);
    if (previewCache.has(deck.id)) return;
    try {
      const response = await fetch(`/api/public-decks/${encodeURIComponent(deck.id)}/preview`);
      if (!response.ok) throw new Error();
      const data: DeckPreview = await response.json();
      previewCache.set(deck.id, data);
      if (selectedId.current === deck.id) setPreview(data);
    } catch {
      if (selectedId.current === deck.id) setPreviewError("デッキを読み込めませんでした。");
    }
  }
  const shown = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ja-JP");
    return decks
      .filter((deck) => format === "all" || deck.format === format)
      .filter((deck) => !normalized || [deck.name, deck.description, ...deck.cardNames].some((text) => text.toLocaleLowerCase("ja-JP").includes(normalized)))
      .toSorted((left, right) => sort === "popular"
        ? right.popularityScore - left.popularityScore || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [decks, format, query, sort]);

  return (
    <div className="public-deck-search">
      <div className="public-deck-controls">
        <label className="public-deck-query"><span aria-hidden="true">⌕</span><input aria-label="公開デッキを検索" onChange={(event) => setQuery(event.target.value)} placeholder="デッキ名・収録カードを入力" value={query} /></label>
        <select aria-label="フォーマット" onChange={(event) => setFormat(event.target.value)} value={format}>
          <option value="all">すべてのフォーマット</option>
          <option value="original">オリジナル</option>
          <option value="advanced">アドバンス</option>
          <option value="duel_party">デュエパーティ</option>
        </select>
      </div>
      <div className="public-deck-summary">
        <button aria-label={`${sort === "popular" ? "更新順" : "人気順"}に切り替え`} onClick={() => setSort((current) => current === "popular" ? "updated" : "popular")} type="button">{sort === "popular" ? "人気順" : "更新順"}<span aria-hidden="true">↕</span></button>
        <p>{shown.length}件<span>の公開デッキ</span></p>
      </div>
      <div className="public-deck-list">
        {shown.map((deck) => (
          <article key={deck.id}>
            <div className="public-deck-thumbnail" onClick={() => openPreview(deck)}><CardArtwork className="public-deck-artwork" imageUrl={deck.imageUrl} name={deck.name} sizes="(max-width: 560px) 108px, (max-width: 980px) 27vw, 264px" /></div>
            <div className="public-deck-information" onClick={() => openPreview(deck)}>
              <header><strong>{deck.name}</strong><em>{formatName(deck.format)}</em></header>
              <small>作成者：{deck.ownerName}</small>
              {deck.description ? <p>{deck.description}</p> : <p>公開デッキの構成を確認できます。</p>}
              <div className="public-deck-cards">{deck.cardNames.slice(0, 3).map((name) => <span key={name}>{name}</span>)}</div>
              <footer><span>メイン {deck.cardCount}枚</span><span>・</span><time dateTime={deck.updatedAt}>{new Date(deck.updatedAt).toLocaleDateString("ja-JP")}</time></footer>
            </div>
            <div className="public-deck-actions">
              <form action={importPublicDeckAction}>
                <input name="deckId" type="hidden" value={deck.id} />
                <input name="destination" type="hidden" value="edit" />
                <button aria-label={`${deck.name}をマイデッキに保存して編集`} type="submit"><span aria-hidden="true" className="ui-icon ui-icon-edit" />編集</button>
              </form>
              <form onSubmit={(event) => { event.preventDefault(); router.push(`/playtest/${deck.id}/opponent?source=public`); }}>
                <button aria-label={`${deck.name}でひとり回し`} type="submit"><span aria-hidden="true" className="ui-icon ui-icon-my-decks" />ひとり回し</button>
              </form>
            </div>
          </article>
        ))}
      </div>
      {!shown.length ? <div className="history-empty"><strong>該当する公開デッキがありません</strong><p>デッキ名、カード名またはフォーマットを変えて検索してください。</p></div> : null}
      {selected ? <div className="public-deck-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
        <section aria-label={`${selected.name}のデッキ確認`} aria-modal="true" className="public-deck-preview" role="dialog">
          <header><h2>{preview?.name ?? selected.name}</h2><button aria-label="閉じる" onClick={closePreview} type="button">×</button></header>
          {previewError ? <p role="alert">{previewError}</p> : null}
          {!preview && !previewError ? <p role="status">読み込み中…</p> : null}
          {preview ? <>
            <div className="public-deck-preview-grid">{Array.from({ length: 40 }, (_, index) => {
              const card = mainCards[index];
              return card ? <button aria-label={`${card.name}を拡大`} key={index} onClick={(event) => { event.stopPropagation(); if (card.imageUrl) setExpandedImage(card.imageUrl); }} type="button"><CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 600px) 12vw, 100px" /></button> : <span className="public-deck-preview-empty" key={index} />;
            })}</div>
            <details onToggle={(event) => setOtherOpen(event.currentTarget.open)} open={otherOpen} className="public-deck-preview-other"><summary>その他</summary><div className="public-deck-preview-other-scroll">{otherZones.map((zone) => <section key={zone}><h3>{zoneName(zone)}</h3><div className="public-deck-preview-grid">{preview.cards.filter((card) => card.zone === zone).map((card, index) => <button aria-label={`${card.name}を拡大`} key={index} onClick={(event) => { event.stopPropagation(); if (card.imageUrl) setExpandedImage(card.imageUrl); }} type="button"><CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 600px) 12vw, 100px" /></button>)}</div></section>)}</div></details>
            {sharedOpen && shareToken ? <div className="public-deck-preview-actions">
              {(["edit", "solo"] as const).map((destination) => <form action={importSharedDeckAction} key={destination}><input name="shareToken" type="hidden" value={shareToken}/><input name="destination" type="hidden" value={destination}/><button type="submit"><span aria-hidden="true" className={`ui-icon ${destination === "edit" ? "ui-icon-edit" : "ui-icon-my-decks"}`}/>{destination === "edit" ? "編集" : "ひとり回し"}</button></form>)}
            </div> : null}
          </> : null}
        </section>
      </div> : null}
      {expandedImage ? <div aria-label="カード画像を閉じる" className="public-deck-image-backdrop" onClick={() => setExpandedImage(null)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setExpandedImage(null); }}><img alt="" draggable={false} src={resolveCardArtworkUrl(expandedImage)} /></div> : null}
    </div>
  );
}
