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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftSearchMode, setDraftSearchMode] = useState<SearchMode>("broad");
  const [draftOnlyFavorites, setDraftOnlyFavorites] = useState(false);
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

  const activeFilterCount =
    (searchMode === "precise" ? 1 : 0) + (onlyFavorites ? 1 : 0);

  const openFilters = () => {
    setDraftSearchMode(searchMode);
    setDraftOnlyFavorites(onlyFavorites);
    setFiltersOpen((current) => !current);
  };

  const applyFilters = () => {
    setSearchMode(draftSearchMode);
    setOnlyFavorites(draftOnlyFavorites);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setDraftSearchMode("broad");
    setDraftOnlyFavorites(false);
    setSearchMode("broad");
    setOnlyFavorites(false);
  };

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
        <div className="search-box">
          <input
            aria-label="カード検索"
            placeholder="カード名を入力"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="カード名を消去" onClick={() => setQuery("")}>
              ×
            </button>
          )}
        </div>
        <button
          className={filtersOpen || activeFilterCount > 0 ? "active" : ""}
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="market-filters"
          onClick={openFilters}
        >
          絞り込み{activeFilterCount > 0 ? `（${activeFilterCount}）` : ""}
        </button>
      </section>

      {filtersOpen && (
        <section className="filter-panel" id="market-filters" aria-label="絞り込み条件">
          <fieldset className="search-mode">
            <legend>検索モード</legend>
            <label>
              <input
                type="radio"
                name="marketSearchMode"
                value="broad"
                checked={draftSearchMode === "broad"}
                onChange={() => setDraftSearchMode("broad")}
              />
              ざっくり <small>目安60%</small>
            </label>
            <label>
              <input
                type="radio"
                name="marketSearchMode"
                value="precise"
                checked={draftSearchMode === "precise"}
                onChange={() => setDraftSearchMode("precise")}
              />
              パーペキ <small>目安90%</small>
            </label>
          </fieldset>

          <label className="filter-check">
            <input
              type="checkbox"
              checked={draftOnlyFavorites}
              onChange={(event) => setDraftOnlyFavorites(event.target.checked)}
            />
            気になるカードだけ表示
          </label>

          <div className="filter-actions">
            <button type="button" className="secondary-button" onClick={resetFilters}>
              条件リセット
            </button>
            <button type="button" className="button" onClick={applyFilters}>
              この条件で検索
            </button>
          </div>
        </section>
      )}

      {activeFilterCount > 0 && (
        <div className="active-filters" aria-label="適用中の条件">
          {searchMode === "precise" && <span>パーペキ検索</span>}
          {onlyFavorites && <span>★ 気になる</span>}
        </div>
      )}

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
