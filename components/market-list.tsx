"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  readFavoriteCardIds,
  toggleFavoriteCardId,
  writeFavoriteCardIds,
} from "@/lib/favorite-cards";
import { CardSummary, Trend } from "@/lib/types";
import {
  SearchMode,
  searchTextMatches,
} from "@/lib/search-normalization";
import { mapMarketSearchResults } from "@/lib/market-search-mapping";
import { createBrowserSupabaseClient } from "@/lib/supabase";

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

export function MarketList({ initialCards, loadError }: MarketListProps) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("broad");
  const [remoteSearch, setRemoteSearch] = useState<{
    key: string;
    cards: CardSummary[];
  } | null>(null);
  const [searchingCards, setSearchingCards] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftOnlyFavorites, setDraftOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(readFavoriteCardIds());
  }, []);

  const pricedCardsById = useMemo(
    () => new Map(initialCards.map((card) => [card.id, card])),
    [initialCards],
  );

  useEffect(() => {
    let cancelled = false;
    const trimmedQuery = query.trim();
    const searchKey = `${searchMode}:${trimmedQuery}`;

    if (!trimmedQuery) {
      setRemoteSearch(null);
      setSearchingCards(false);
      setSearchError(null);
      return;
    }

    setSearchingCards(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        if (!cancelled) {
          setSearchingCards(false);
          setSearchError("カード検索を利用できません。しばらくしてから再度お試しください。");
        }
        return;
      }

      const { data, error } = await supabase.rpc("search_canonical_cards", {
        p_game_slug: "duel-masters",
        p_limit: 100,
        p_mode: searchMode,
        p_query: trimmedQuery,
      });

      if (cancelled) return;
      setSearchingCards(false);
      if (error) {
        setSearchError("カード候補を読み込めませんでした。");
        return;
      }

      setRemoteSearch({
        key: searchKey,
        cards: mapMarketSearchResults(data, pricedCardsById),
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pricedCardsById, query, searchMode]);

  const toggleFavorite = (id: string) => {
    const next = toggleFavoriteCardId(favorites, id);
    setFavorites(next);
    writeFavoriteCardIds(next);
  };

  const cards = useMemo(() => {
    const trimmedQuery = query.trim();
    const searchKey = `${searchMode}:${trimmedQuery}`;
    if (trimmedQuery && remoteSearch?.key === searchKey) {
      return remoteSearch.cards.filter(
        (card) => !onlyFavorites || favorites.includes(card.id),
      );
    }

    return initialCards.filter((card) => {
      return (
        searchTextMatches(
          query,
          [
            card.name,
            card.nameKana,
            ...card.aliases,
          ],
          searchMode,
        ) &&
        (!onlyFavorites || favorites.includes(card.id))
      );
    });
  }, [favorites, initialCards, onlyFavorites, query, remoteSearch, searchMode]);

  const activeFilterCount = onlyFavorites ? 1 : 0;

  const openFilters = () => {
    setDraftOnlyFavorites(onlyFavorites);
    setFiltersOpen((current) => !current);
  };

  const applyFilters = () => {
    setOnlyFavorites(draftOnlyFavorites);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setDraftOnlyFavorites(false);
    setOnlyFavorites(false);
  };

  return (
    <div className="market-shell">
      <nav className="game-tabs" aria-label="TCGを選択">
        <button type="button" aria-current="page">デュエマ</button>
        <button type="button" disabled>ポケカ</button>
        <button type="button" disabled>遊戯王</button>
        <button type="button" disabled>その他</button>
      </nav>

      <div className="market-content">

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

      <div className="market-search-modes" role="group" aria-label="検索方法">
        <button
          className={searchMode === "broad" ? "active" : ""}
          type="button"
          aria-pressed={searchMode === "broad"}
          onClick={() => setSearchMode("broad")}
        >
          ざっくり検索
        </button>
        <button
          className={searchMode === "precise" ? "active" : ""}
          type="button"
          aria-pressed={searchMode === "precise"}
          onClick={() => setSearchMode("precise")}
        >
          パーペキ検索
        </button>
      </div>

      {filtersOpen && (
        <section className="filter-panel" id="market-filters" aria-label="絞り込み条件">
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
          {onlyFavorites && <span>★ 気になる</span>}
        </div>
      )}

      {searchError && (
        <p className="notice error" role="alert">
          {searchError}
        </p>
      )}

      <p className="market-result-count" aria-live="polite">
        {searchingCards ? "検索中…" : `検索結果 ${cards.length}件`}
      </p>

      <div className="grid">
        {cards.map((card) => (
          <article className={card.isStale ? "card muted" : "card"} key={card.id}>
            <div className="card-head">
              <div>
                <h2>
                  {card.updatedAt === null ? (
                    card.name
                  ) : (
                    <Link href={`/cards/${card.id}`}>{card.name}</Link>
                  )}
                </h2>
                <small>収録バリエーション {card.printCount}件</small>
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
                <small>販売平均（{card.saleRecordCount}件）</small>
                <strong className={trendClass(card.saleTrend, card.isStale)}>
                  {yen(card.salePrice)}
                </strong>
              </div>
              <div>
                <small>買取平均（{card.buyRecordCount}件）</small>
                <strong className={trendClass(card.buyTrend, card.isStale)}>
                  {yen(card.buyPrice)}
                </strong>
              </div>
            </div>
            {card.usesPrintFallback && (
              <p className="fallback-note">収録違いの価格を参考表示中</p>
            )}
            <Link className="card-register-link" href={`/register?cardId=${card.id}`}>
              <span aria-hidden="true">＋</span> このカードを登録
            </Link>
            {card.updatedAt !== null && (
              <Link className="detail-link" href={`/cards/${card.id}`}>
                詳細を見る →
              </Link>
            )}
          </article>
        ))}
      </div>

      {!loadError && !searchError && !searchingCards && cards.length === 0 && (
        <p className="empty">
          {initialCards.length === 0
            ? "登録済みのカードはありません。"
            : "条件に一致するカードはありません。"}
        </p>
      )}
      </div>
    </div>
  );
}
