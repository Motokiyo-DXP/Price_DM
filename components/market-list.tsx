"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { CardArtwork } from "@/components/card-artwork";
import { CardSummary, Trend } from "@/lib/types";
import {
  SearchMode,
  searchTextMatches,
} from "@/lib/search-normalization";
import { mapMarketSearchResults } from "@/lib/market-search-mapping";
import { pickCardPrintRepresentativesByCanonicalCardId } from "@/lib/card-print-order";
import { CARD_SEARCH_DEBOUNCE_MS } from "@/lib/search-timing";
import { readFavoriteCardIds } from "@/lib/favorite-cards";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import cartIcon from "@/SVG/カートのアイコン素材.svg";
import { useImeRealtimeInput } from "@/lib/use-ime-realtime-input";
import { normalizeJapaneseSearch } from "@/lib/search-normalization";

type MarketListProps = {
  initialCards: CardSummary[];
  loadError: string | null;
};

type MarketSort = "search" | "all-updated" | "own-updated" | "release-date";

const yen = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("ja-JP")}円`;

const trendClass = (trend: Trend, stale: boolean) => {
  if (stale) return "stale";
  if (trend === "up") return "up";
  if (trend === "down") return "down";
  return "";
};

export function MarketList({ initialCards, loadError }: MarketListProps) {
  const cardSearchInput = useImeRealtimeInput();
  const query = cardSearchInput.value;
  const searchRequestSequence = useRef(0);
  const [searchMode, setSearchMode] = useState<SearchMode>("broad");
  const [remoteSearch, setRemoteSearch] = useState<{
    key: string;
    cards: CardSummary[];
  } | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "success" | "empty" | "error">("idle");
  const [searchStatusKey, setSearchStatusKey] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteUserId, setFavoriteUserId] = useState<string | null | undefined>(undefined);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<MarketSort>("search");
  const [sortMetadata, setSortMetadata] = useState<Record<string, {
    allAccountsUpdatedAt: string | null;
    ownAccountUpdatedAt: string | null;
    latestReleaseDate: string | null;
  }>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set([
      ...initialCards.map((card) => card.id),
      ...(remoteSearch?.cards ?? []).map((card) => card.id),
    ])].map(Number).filter(Number.isSafeInteger);
    if (!ids.length) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    void supabase.rpc("load_market_card_sort_metadata", { p_card_ids: ids }).then(({ data }) => {
      if (cancelled || !data) return;
      setSortMetadata((current) => {
        const next = { ...current };
        for (const row of data) next[String(row.canonical_card_id)] = {
          allAccountsUpdatedAt: row.all_accounts_updated_at,
          ownAccountUpdatedAt: row.own_account_updated_at,
          latestReleaseDate: row.latest_release_date,
        };
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [initialCards, remoteSearch]);

  useEffect(() => {
    let cancelled = false;
    const loadFavorites = async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) return;
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;
      const userId = userData.user?.id;
      if (authError && !isAuthSessionMissingError(authError)) {
        setFavoriteUserId(null);
        setFavoriteError("ログイン状態を確認できませんでした。ページを再読み込みしてください。");
        return;
      }
      if (typeof userId !== "string") {
        setFavoriteUserId(null);
        return;
      }
      const legacyFavorites = readFavoriteCardIds();
      if (legacyFavorites.length) {
        const { error: migrationError } = await supabase.from("account_card_bookmarks").upsert(
          legacyFavorites.map((canonicalCardId) => ({ user_id: userId, canonical_card_id: Number(canonicalCardId) })),
          { onConflict: "user_id,canonical_card_id", ignoreDuplicates: true },
        );
        if (!migrationError) window.localStorage.removeItem("tcg-favorites");
      }
      const { data, error } = await supabase.from("account_card_bookmarks").select("canonical_card_id").order("created_at", { ascending: false });
      if (cancelled) return;
      setFavoriteUserId(userId);
      if (error) setFavoriteError("買い物リストを読み込めませんでした。");
      else setFavorites((data ?? []).map((row) => String(row.canonical_card_id)));
    };
    void loadFavorites();
    return () => { cancelled = true; };
  }, []);

  const pricedCardsById = useMemo(
    () => new Map(initialCards.map((card) => [card.id, card])),
    [initialCards],
  );
  const normalizedQuery = normalizeJapaneseSearch(query);
  const searchQuery = useMemo(() => query.trim(), [normalizedQuery]);
  const currentSearchKey = `${searchMode}:${searchQuery}`;
  const currentSearchStatus = searchStatusKey === currentSearchKey
    ? searchStatus
    : searchQuery ? "searching" : "idle";

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    const requestSequence = ++searchRequestSequence.current;
    const trimmedQuery = searchQuery;
    const searchKey = `${searchMode}:${trimmedQuery}`;

    if (!trimmedQuery) {
      setRemoteSearch(null);
      setSearchError(null);
      setSearchStatusKey(searchKey);
      setSearchStatus("idle");
      return;
    }

    setSearchStatusKey(searchKey);
    setSearchStatus("searching");
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        if (!cancelled) {
          setSearchError("カード検索を利用できません。しばらくしてから再度お試しください。");
          setSearchStatus("error");
        }
        return;
      }

      controller = new AbortController();
      let data;
      let error;
      try {
        ({ data, error } = await supabase.rpc("search_market_cards", {
          p_game_slug: "duel-masters",
          p_limit: 100,
          p_mode: searchMode,
          p_query: trimmedQuery,
        }).abortSignal(controller.signal));
      } catch {
        if (!cancelled && requestSequence === searchRequestSequence.current) {
          setSearchError("カード候補を読み込めませんでした。");
          setSearchStatus("error");
        }
        return;
      }

      if (cancelled || requestSequence !== searchRequestSequence.current) return;
      if (error) {
        setSearchError("カード候補を読み込めませんでした。");
        setSearchStatus("error");
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      const canonicalCardIds = [...new Set(rows.flatMap((row) =>
        row && typeof row === "object" && Number.isSafeInteger(row.id) ? [Number(row.id)] : [],
      ))];
      const printQueries = Array.from({ length: Math.ceil(canonicalCardIds.length / 20) }, (_, index) =>
        supabase.from("card_prints")
          .select("id, canonical_card_id, image_key, product_name, card_number, official_card_id")
          .in("canonical_card_id", canonicalCardIds.slice(index * 20, (index + 1) * 20))
          .not("image_key", "is", null)
          .is("deleted_at", null)
          .order("id")
          .abortSignal(controller!.signal),
      );
      let printResults: Awaited<(typeof printQueries)[number]>[] = [];
      try {
        printResults = await Promise.all(printQueries);
      } catch {
        // Keep usable search results if the optional artwork batch fails.
      }
      if (cancelled || requestSequence !== searchRequestSequence.current) return;
      const representatives = pickCardPrintRepresentativesByCanonicalCardId(
        printResults.flatMap(({ data: prints }) => prints ?? []),
      );
      const mappedCards = mapMarketSearchResults(data, pricedCardsById, representatives);
      setRemoteSearch({ key: searchKey, cards: mappedCards });
      setSearchStatus(mappedCards.length > 0 ? "success" : "empty");
      setSearchError(null);
    }, CARD_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [pricedCardsById, searchQuery, searchMode]);

  const toggleFavorite = async (id: string) => {
    if (favoriteUserId === undefined) {
      setFavoriteError("ログイン状態を確認しています。少し待ってから再度お試しください。");
      return;
    }
    if (!favoriteUserId) {
      window.location.assign(`/login?next=${encodeURIComponent("/")}`);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const wasFavorite = favorites.includes(id);
    setFavoriteError(null);
    setFavorites((current) => wasFavorite ? current.filter((favoriteId) => favoriteId !== id) : [...current, id]);
    const request = wasFavorite
      ? supabase.from("account_card_bookmarks").delete().eq("canonical_card_id", Number(id))
      : supabase.from("account_card_bookmarks").insert({ user_id: favoriteUserId, canonical_card_id: Number(id) });
    const { error } = await request;
    if (error) {
      setFavorites((current) => wasFavorite ? [...current, id] : current.filter((favoriteId) => favoriteId !== id));
      setFavoriteError("買い物リストを更新できませんでした。");
    }
  };

  const cards = useMemo(() => {
    const trimmedQuery = searchQuery;
    const searchKey = `${searchMode}:${trimmedQuery}`;
    const matchingCards = trimmedQuery && remoteSearch?.key === searchKey
      ? remoteSearch.cards
      : initialCards.filter((card) => {
      return (
          searchTextMatches(
          query,
          [
            card.name,
            card.nameKana,
            ...card.aliases,
          ],
          searchMode,
        )
      );
    });
    if (trimmedQuery && sortMode === "search") return matchingCards;
    const effectiveSortMode = sortMode === "search" ? "all-updated" : sortMode;
    const sortedCards = [...matchingCards].sort((a, b) => {
      const favoriteOrder = Number(favorites.includes(b.id)) - Number(favorites.includes(a.id));
      if (favoriteOrder) return favoriteOrder;
      const aMeta = sortMetadata[a.id];
      const bMeta = sortMetadata[b.id];
      const aReleaseDate = aMeta?.latestReleaseDate ?? a.latestReleaseDate;
      const bReleaseDate = bMeta?.latestReleaseDate ?? b.latestReleaseDate;
      const dateCompare = (left: string | null | undefined, right: string | null | undefined) =>
        (right ? Date.parse(right) : 0) - (left ? Date.parse(left) : 0);
      if (effectiveSortMode === "release-date") {
        return dateCompare(aReleaseDate, bReleaseDate) || Number(a.id) - Number(b.id);
      }
      const updateField = effectiveSortMode === "own-updated" ? "ownAccountUpdatedAt" : "allAccountsUpdatedAt";
      const aUpdated = aMeta?.[updateField] ?? (effectiveSortMode === "all-updated" ? a.allAccountsUpdatedAt : null);
      const bUpdated = bMeta?.[updateField] ?? (effectiveSortMode === "all-updated" ? b.allAccountsUpdatedAt : null);
      if (aUpdated && bUpdated) return dateCompare(aUpdated, bUpdated) || dateCompare(aReleaseDate, bReleaseDate) || Number(a.id) - Number(b.id);
      if (aUpdated) return -1;
      if (bUpdated) return 1;
      return dateCompare(aReleaseDate, bReleaseDate) || Number(a.id) - Number(b.id);
    });
    return sortedCards;
  }, [favorites, initialCards, query, searchQuery, remoteSearch, searchMode, sortMetadata, sortMode]);

  return (
    <div className="market-shell">
      <div className="market-content">

      <div className="primary-page-title market-page-title">
        <h1>相場チェック</h1>
        <div className="directory-accent" aria-hidden="true" />
      </div>

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
            onChange={cardSearchInput.onChange}
            onCompositionStart={cardSearchInput.onCompositionStart}
            onCompositionEnd={cardSearchInput.onCompositionEnd}
          />
          {query && (
            <button type="button" aria-label="カード名を消去" onClick={() => cardSearchInput.setValue("")}>
              ×
            </button>
          )}
        </div>
        <Link aria-label="買い物リストを開く" className="market-shopping-link" href="/shopping-list">
          <Image alt="" aria-hidden="true" height={24} src={cartIcon} width={24} />
          <span>買い物リスト</span>
        </Link>
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

      <label className="market-sort-control">
        並び替え
        <select aria-label="カードの並び替え" value={searchQuery || sortMode !== "search" ? sortMode : "all-updated"} onChange={(event) => setSortMode(event.target.value as MarketSort)}>
          {searchQuery ? <option value="search">検索順</option> : null}
          <option value="all-updated">更新順・全アカウント</option>
          <option value="own-updated">更新順・自アカウント</option>
          <option value="release-date">収録日順</option>
        </select>
      </label>

      {favoriteError && <p className="notice error" role="alert">{favoriteError}</p>}

      {currentSearchStatus === "error" && searchError && (
        <p className="notice error" role="alert">
          {searchError}
        </p>
      )}

      <p className="market-result-count" aria-live="polite">
        {currentSearchStatus === "searching"
          ? "検索中…"
          : currentSearchStatus === "error"
            ? "検索できませんでした"
            : currentSearchStatus === "empty"
              ? "条件に一致するカードはありません"
              : `検索結果 ${cards.length}件`}
      </p>

      <div className="grid">
        {cards.map((card, index) => (
          <article className={card.isStale ? "card muted" : "card"} key={card.id}>
            <Link aria-label={card.name + "の詳細を見る"} className="market-card-artwork-link" href={"/cards/" + card.id}>
              <CardArtwork eager={index < 6} imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 620px) 82px, 104px" />
            </Link>
            <div className="card-head">
              <div>
                <h2>
                  {card.updatedAt === null ? (
                    card.name
                  ) : (
                    <Link href={`/cards/${card.id}`}>{card.name}</Link>
                  )}
                </h2>
              </div>
              <button
                className="star"
                type="button"
                aria-label={`${card.name}を${favorites.includes(card.id) ? "買い物リストから削除" : "買い物リストへ追加"}`}
                aria-pressed={favorites.includes(card.id)}
                onClick={() => void toggleFavorite(card.id)}
              >
                {favorites.includes(card.id) ? "★" : "☆"}
              </button>
            </div>
            <div className="prices">
              <div>
                <small>販売平均</small>
                <strong className={trendClass(card.saleTrend, card.isStale)}>
                  {yen(card.salePrice)}
                </strong>
              </div>
              <div>
                <small>買取平均</small>
                <strong className={trendClass(card.buyTrend, card.isStale)}>
                  {yen(card.buyPrice)}
                </strong>
              </div>
            </div>
            {card.usesPrintFallback && (
              <p className="fallback-note">収録違いの価格を参考表示中</p>
            )}
            <div className="market-card-actions">
              <Link className="card-register-link" href={`/register?cardId=${card.id}`}>
                <span aria-hidden="true">＋</span> このカードを登録
              </Link>
              {card.updatedAt !== null && (
                <Link className="detail-link" href={`/cards/${card.id}`}>
                  詳細を見る <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>

      {!loadError && !searchError && currentSearchStatus === "idle" && initialCards.length === 0 && (
        <p className="empty">登録済みのカードはありません。</p>
      )}
      {!loadError && !searchError && currentSearchStatus === "empty" && cards.length === 0 && (
        <p className="empty">
          条件に一致するカードはありません。
        </p>
      )}
      </div>
    </div>
  );
}
