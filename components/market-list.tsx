"use client";

import { useEffect, useMemo, useState } from "react";
import { CardSummary, Trend } from "@/lib/types";
import {
  SearchMode,
  searchTextMatches,
} from "@/lib/search-normalization";

type MarketListProps = {
  initialCards: CardSummary[];
  loadError: string | null;
};

const yen = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("ja-JP")}円`;

const trendClass = (trend: Trend, stale: boolean) => {
  if (stale) return "stale";
  if (trend === "up") return "up";
  if (trend === "down") return "down";
  return "";
};

const formatObservedDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));

export function MarketList({ initialCards, loadError }: MarketListProps) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("broad");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("tcg-favorites") ?? "[]",
      );
      if (Array.isArray(stored)) {
        setFavorites(stored.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      localStorage.removeItem("tcg-favorites");
    }
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = current.includes(id)
        ? current.filter((favoriteId) => favoriteId !== id)
        : [...current, id];
      localStorage.setItem("tcg-favorites", JSON.stringify(next));
      return next;
    });
  };

  const cards = useMemo(() => {
    return initialCards.filter((card) => {
      return (
        searchTextMatches(
          query,
          [
            card.name,
            card.nameKana,
            ...card.aliases,
            card.setCode,
            card.productName,
          ],
          searchMode,
        ) &&
        (!onlyFavorites || favorites.includes(card.id))
      );
    });
  }, [favorites, initialCards, onlyFavorites, query, searchMode]);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">みんなで共有 カード相場</p>
        <h1>価格の動きを、ひと目で。</h1>
        <p>カード名を検索し、販売・買取価格と在庫状況を確認できます。</p>
      </section>

      {loadError && (
        <p className="notice error" role="alert">
          {loadError}
        </p>
      )}

      <section className="toolbar" aria-label="相場の絞り込み">
        <input
          aria-label="カード検索"
          placeholder="カード名・収録番号で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="検索の厳しさ"
          value={searchMode}
          onChange={(event) => setSearchMode(event.target.value as SearchMode)}
        >
          <option value="broad">ざっくり検索（60%）</option>
          <option value="precise">完璧検索（90%）</option>
        </select>
        <button
          className={onlyFavorites ? "active" : ""}
          type="button"
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((current) => !current)}
        >
          ★ 気になる
        </button>
      </section>

      <div className="grid">
        {cards.map((card) => (
          <article className={card.isStale ? "card muted" : "card"} key={card.id}>
            <div className="card-head">
              <div>
                <span className="tag">{card.game}</span>
                <h2>{card.name}</h2>
                <small>{card.setCode ?? "収録番号未登録"}</small>
              </div>
              <button
                className="star"
                type="button"
                aria-label={`${card.name}を気になるカードに${favorites.includes(card.id) ? "登録解除" : "登録"}`}
                aria-pressed={favorites.includes(card.id)}
                onClick={() => toggleFavorite(card.id)}
              >
                {favorites.includes(card.id) ? "★" : "☆"}
              </button>
            </div>
            <div className="prices">
              <div>
                <small>販売価格</small>
                <strong className={trendClass(card.saleTrend, card.isStale)}>
                  {yen(card.salePrice)}
                </strong>
              </div>
              <div>
                <small>買取価格</small>
                <strong className={trendClass(card.buyTrend, card.isStale)}>
                  {yen(card.buyPrice)}
                </strong>
              </div>
            </div>
            <footer>
              <span>{card.stock}</span>
              <span>
                {!card.updatedAt
                  ? "価格未登録"
                  : card.isStale
                    ? "30日以上更新なし"
                    : `${formatObservedDate(card.updatedAt)} 更新${card.shopName ? `・${card.shopName}` : ""}`}
              </span>
            </footer>
          </article>
        ))}
      </div>

      {!loadError && cards.length === 0 && (
        <p className="empty">
          {initialCards.length === 0
            ? "登録済みのカードはありません。"
            : "条件に一致するカードはありません。"}
        </p>
      )}
    </>
  );
}
