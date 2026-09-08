"use client";

import { type FormEvent, useMemo, useState } from "react";
import { CardArtwork } from "@/components/card-artwork";

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
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<"popular" | "updated">("popular");
  const shown = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ja-JP");
    return decks
      .filter((deck) => format === "all" || deck.format === format)
      .filter((deck) => !normalized || [deck.name, deck.description, ...deck.cardNames].some((text) => text.toLocaleLowerCase("ja-JP").includes(normalized)))
      .toSorted((left, right) => sort === "popular"
        ? right.popularityScore - left.popularityScore || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [decks, format, query, sort]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draftQuery);
  }

  return (
    <div className="public-deck-search">
      <form className="public-deck-controls" onSubmit={submit}>
        <label className="public-deck-query"><span aria-hidden="true">⌕</span><input aria-label="公開デッキを検索" onChange={(event) => setDraftQuery(event.target.value)} placeholder="デッキ名・収録カードを入力" value={draftQuery} /></label>
        <select aria-label="フォーマット" onChange={(event) => setFormat(event.target.value)} value={format}>
          <option value="all">すべてのフォーマット</option>
          <option value="original">オリジナル</option>
          <option value="advanced">アドバンス</option>
          <option value="duel_party">デュエパーティ</option>
        </select>
        <button type="submit">検索</button>
      </form>
      <div className="public-deck-summary">
        <button aria-label={`${sort === "popular" ? "更新順" : "人気順"}に切り替え`} onClick={() => setSort((current) => current === "popular" ? "updated" : "popular")} type="button">{sort === "popular" ? "人気順" : "更新順"}<span aria-hidden="true">↕</span></button>
        <p>{shown.length}件<span>の公開デッキ</span></p>
      </div>
      <div className="public-deck-list">
        {shown.map((deck) => (
          <article key={deck.id}>
            <div className="public-deck-thumbnail"><CardArtwork className="public-deck-artwork" imageUrl={deck.imageUrl} name={deck.name} sizes="(max-width: 560px) 108px, (max-width: 980px) 27vw, 264px" /></div>
            <div className="public-deck-information">
              <header><strong>{deck.name}</strong><em>{formatName(deck.format)}</em></header>
              <small>作成者：{deck.ownerName}</small>
              {deck.description ? <p>{deck.description}</p> : <p>公開デッキの構成を確認できます。</p>}
              <div className="public-deck-cards">{deck.cardNames.slice(0, 3).map((name) => <span key={name}>{name}</span>)}</div>
              <footer><span>メイン {deck.cardCount}枚</span><span>・</span><time dateTime={deck.updatedAt}>{new Date(deck.updatedAt).toLocaleDateString("ja-JP")}</time></footer>
            </div>
            <div className="public-deck-open" aria-hidden="true"><span>デッキを見る</span><b>→</b></div>
          </article>
        ))}
      </div>
      {!shown.length ? <div className="history-empty"><strong>該当する公開デッキがありません</strong><p>デッキ名、カード名またはフォーマットを変えて検索してください。</p></div> : null}
    </div>
  );
}
