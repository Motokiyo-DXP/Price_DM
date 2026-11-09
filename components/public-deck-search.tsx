"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { importPublicDeckAction, importSharedDeckAction } from "@/app/decks/actions";
import { CardArtwork } from "@/components/card-artwork";
import { formatJapaneseDate } from "@/lib/japanese-date";
import { ExpandedCardArtwork } from "@/components/expanded-card-artwork";
import { getDeckPreview, hasDeckPreview, setDeckPreview, type PreviewCard, type DeckPreview } from "@/lib/deck-preview-cache";
import { useImeRealtimeInput } from "@/lib/use-ime-realtime-input";

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

export function PublicDeckSearch({ decks }: { decks: PublicDeckItem[] }) {
  const shareToken = useSearchParams().get("share");
  const router = useRouter();
  const deckSearchInput = useImeRealtimeInput();
  const query = deckSearchInput.value;
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
    if (!shareToken) { if (sharedOpen) { setSharedOpen(false); setSelected(null); selectedId.current = null; } return; }
    let active = true;
    selectedId.current = shareToken;
    setSharedOpen(true);
    setSelected({ id: shareToken, name: "共有デッキ", description: "", format: "", ownerName: "", cardNames: [], cardCount: 0, imageUrl: null, popularityScore: 0, updatedAt: "" });
    setPreview(null);
    setPreviewError("");
    setOtherOpen(false);
    fetch(`/api/shared-decks/${encodeURIComponent(shareToken)}/preview`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<DeckPreview>;
    }).then((data) => { if (active && selectedId.current === shareToken) setPreview(data); }).catch(() => { if (active && selectedId.current === shareToken) setPreviewError("デッキを読み込めませんでした。"); });
    return () => { active = false; };
  }, [shareToken]);
  function closePreview() {
    selectedId.current = null;
    setSelected(null);
    setExpandedImage(null);
    if (sharedOpen) { setSharedOpen(false); const next = new URL(window.location.href); next.searchParams.delete("share"); window.history.replaceState(null, "", next); }
  }
  const otherZones = useMemo(() => [...new Set(preview?.cards.filter((card) => card.zone !== "main").map((card) => card.zone) ?? [])], [preview]);
  const mainCards = preview?.cards.filter((card) => card.zone === "main").slice(0, 60) ?? [];
  async function openPreview(deck: PublicDeckItem) {
    setSharedOpen(false);
    selectedId.current = deck.id;
    setSelected(deck);
    setPreview(getDeckPreview("public", deck.id) ?? null);
    setPreviewError("");
    setOtherOpen(false);
    if (hasDeckPreview("public", deck.id)) return;
    try {
      const response = await fetch(`/api/public-decks/${encodeURIComponent(deck.id)}/preview`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: DeckPreview = await response.json();
      setDeckPreview("public", deck.id, data);
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
      <div className="my-decks-filters public-directory-filters">
        <label><span aria-hidden="true">⌕</span><input aria-label="公開デッキを検索" onChange={deckSearchInput.onChange} onCompositionStart={deckSearchInput.onCompositionStart} onCompositionEnd={deckSearchInput.onCompositionEnd} placeholder="デッキ名・収録カードを入力" value={query} /></label>
        <select aria-label="公開デッキの並び順" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="popular">人気順</option><option value="updated">更新順</option></select>
        <select aria-label="フォーマット" onChange={(event) => setFormat(event.target.value)} value={format}><option value="all">すべてのフォーマット</option><option value="original">オリジナル</option><option value="advanced">アドバンス</option><option value="duel_party">デュエパーティ</option></select>
      </div>
      <p className="deck-reorder-help">{shown.length}件の公開デッキ</p>
      <div className="deck-folder-group public-directory-group">
        <div className="deck-folder-heading"><span className="deck-folder-toggle"><strong>公開デッキ</strong></span></div>
        <div className="my-decks-list">
        {shown.map((deck) => (
          <article aria-label={`${deck.name}を確認`} className="my-deck-row" key={deck.id}>
            <button aria-label={`${deck.name}を確認`} className="my-deck-icon-button" onClick={() => openPreview(deck)} type="button"><CardArtwork className="my-deck-thumbnail" fit="cover" imageUrl={deck.imageUrl} name={deck.name} sizes="110px" /></button>
            <button aria-label={`${deck.name}の詳細を開く`} className="my-deck-details-button" onClick={() => openPreview(deck)} type="button">
              <span className="my-deck-info"><strong>{deck.name}</strong><span className="my-deck-badges"><em>{formatName(deck.format)}</em><em>{deck.cardCount}枚</em></span><span className="my-deck-counts public-directory-author" title={`作成者：${deck.ownerName}`}>作成者：{deck.ownerName}</span></span>
            </button>
            <form action={importPublicDeckAction} className="public-directory-action">
              <input name="deckId" type="hidden" value={deck.id} /><input name="destination" type="hidden" value="edit" />
              <button aria-label={`${deck.name}をマイデッキに保存して編集`} className="my-deck-edit" title="マイデッキに保存して編集" type="submit"><span aria-hidden="true" className="ui-icon ui-icon-edit" /></button>
            </form>
            <form className="public-directory-action" onSubmit={(event) => { event.preventDefault(); router.push(`/playtest/${deck.id}/opponent?source=public`); }}>
              <button aria-label={`${deck.name}でひとり回し`} className="my-deck-more" title="ひとり回し" type="submit"><span aria-hidden="true" className="ui-icon ui-icon-my-decks" /></button>
            </form>
          </article>
        ))}
        </div>
      </div>
      {!shown.length ? <div className="history-empty"><strong>該当する公開デッキがありません</strong><p>デッキ名、カード名またはフォーマットを変えて検索してください。</p></div> : null}
      {selected ? <div className="public-deck-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
        <section aria-label={`${selected.name}のデッキ確認`} aria-modal="true" className="public-deck-preview" role="dialog">
          <header><h2>{preview?.name ?? selected.name}</h2><button aria-label="閉じる" onClick={closePreview} type="button">×</button></header>
          {!sharedOpen ? <div className="public-directory-preview-meta"><p>作成者：{selected.ownerName} ・ メイン {selected.cardCount}枚 ・ <time dateTime={selected.updatedAt}>{formatJapaneseDate(selected.updatedAt)}</time></p>{selected.description ? <p>{selected.description}</p> : null}<p>{selected.cardNames.slice(0, 3).join(" / ")}</p></div> : null}
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
      {expandedImage ? <div aria-label="カード画像を閉じる" className="public-deck-image-backdrop" onClick={() => setExpandedImage(null)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setExpandedImage(null); }}><ExpandedCardArtwork imageUrl={expandedImage} /></div> : null}
    </div>
  );
}
