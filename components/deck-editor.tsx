"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDeckAction, updateDeckAction } from "@/app/decks/actions";
import { initialDeckActionState } from "@/app/decks/action-state";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { invalidateDeckPreviewCache } from "@/lib/deck-preview-cache";
import { sortDeckCards, type DeckSortKey, type SortDirection } from "@/lib/deck-sorting";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { CARD_SEARCH_DEBOUNCE_MS } from "@/lib/search-timing";
import { DeckAnalysis } from "@/components/deck-analysis";
import { MAX_MAIN_DECK_CARDS } from "@/lib/deck-validation";
import { isImeCompositionEnter, useImeRealtimeInput } from "@/lib/use-ime-realtime-input";
import { normalizeJapaneseSearch } from "@/lib/search-normalization";

type ImageOption = { printId: number; url: string };
type SearchCard = { id: number; name: string; name_kana: string | null; print_count: number; usage_count?: number; cost?: number | null; civilizations?: string[]; cardTypes?: string[]; imageUrl: string | null; imageOptions: ImageOption[]; productNames: string[]; cardNumbers: string[]; newestPrintId: number; hydrated?: boolean };
type SelectedCard = { canonicalCardId: number; cardPrintId: number | null; name: string; quantity: number; imageUrl: string | null; cost?: number | null; civilizations?: string[] };
type DeckTab = "main" | "gr" | "special";
type DeckSearchSortKey = "relevance" | "name" | "release_date" | "usage";
type SearchStatus = "idle" | "searching" | "success" | "empty" | "error";
export type DeckEditorInitialData = { id: string; name: string; format: "original" | "advanced" | "duel_party"; visibility: "private" | "unlisted" | "public"; description: string; cards: SelectedCard[] };
const SEARCH_PAGE_SIZE = 24;

export function DeckEditor({ initialDeck, fallbackCosts = {} }: { initialDeck?: DeckEditorInitialData; fallbackCosts?: Record<string, number> }) {
  const submitAction = useMemo(() => initialDeck ? updateDeckAction.bind(null, initialDeck.id) : createDeckAction, [initialDeck]);
  const [state, formAction, pending] = useActionState(submitAction, initialDeckActionState);
  const cardSearchInput = useImeRealtimeInput();
  const query = cardSearchInput.value;
  const [results, setResults] = useState<SearchCard[]>([]);
  const [cards, setCards] = useState<SelectedCard[]>(initialDeck?.cards ?? []);
  const [format, setFormat] = useState<DeckEditorInitialData["format"]>(initialDeck?.format ?? "original");
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchStatusKey, setSearchStatusKey] = useState("");
  const [resultsSearchKey, setResultsSearchKey] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DeckTab>("main");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SearchCard | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedCardDetailsLoading, setSelectedCardDetailsLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const productSearchInput = useImeRealtimeInput();
  const productQuery = productSearchInput.value;
  const cardNumberSearchInput = useImeRealtimeInput();
  const cardNumberFilter = cardNumberSearchInput.value;
  const [productCodeByName, setProductCodeByName] = useState<Record<string, string[]>>({});
  const [allProductNames, setAllProductNames] = useState<string[]>([]);
  const [allCardTypes, setAllCardTypes] = useState<string[]>([]);
  const [allCosts, setAllCosts] = useState<number[]>([]);
  const [filterOptionsError, setFilterOptionsError] = useState(false);
  const [productListOpen, setProductListOpen] = useState(false);
  const [civilizationFilter, setCivilizationFilter] = useState<string[]>([]);
  const [civilizationMode, setCivilizationMode] = useState<"cup" | "cap">("cup");
  const [colorFilter, setColorFilter] = useState<"all" | "single" | "multi">("all");
  const [cardTypeFilter, setCardTypeFilter] = useState("");
  const [cardTypeListOpen, setCardTypeListOpen] = useState(false);
  const [minimumCost, setMinimumCost] = useState("");
  const [maximumCost, setMaximumCost] = useState("");
  const [includeNoCost, setIncludeNoCost] = useState(false);
  const [imageFilter, setImageFilter] = useState<"all" | "with" | "without">("all");
  const [searchSort, setSearchSort] = useState<DeckSearchSortKey>("relevance");
  const [searchSortDirection, setSearchSortDirection] = useState<SortDirection>("asc");
  // A new deck has no persisted order yet, so keep the historical cost-ascending default.
  // Existing decks continue to render their saved sort_order unchanged.
  const [deckSort, setDeckSort] = useState<DeckSortKey | null>(initialDeck ? null : "cost");
  const [deckSortDirection, setDeckSortDirection] = useState<SortDirection>("asc");
  const resultCountRef = useRef(0);
  const searchRequestRef = useRef(0);
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchInFlightRef = useRef(false);
  const cardDetailsRequestRef = useRef(0);
  const total = useMemo(() => cards.reduce((sum, card) => sum + card.quantity, 0), [cards]);
  const deckLimit = MAX_MAIN_DECK_CARDS;
  const orderedCards = useMemo(() => deckSort ? sortDeckCards(cards, deckSort, deckSortDirection) : cards, [cards, deckSort, deckSortDirection]);
  const expandedCards = useMemo(
    () => orderedCards.flatMap((card) => Array.from({ length: card.quantity }, (_, copyIndex) => ({ ...card, copyIndex }))),
    [orderedCards],
  );
  const productOptions = allProductNames;
  const matchingProducts = productOptions.filter((name) => {
    const term = productQuery.trim().toLocaleLowerCase();
    return !term || name.toLocaleLowerCase().includes(term) || productCodeByName[name]?.some((code) => code.toLocaleLowerCase().includes(term));
  });
  const cardTypePriority = ["クリーチャー", "呪文", "フィールド", "城", "クロスギア", "進化クリーチャー", "進化クリーチャー（墓地進化V）", "エグザイルクリーチャー"];
  const cardTypeOptions = [...allCardTypes].sort((a, b) => {
    const priority = (value: string) => cardTypePriority.findIndex((name) => value.replace(/[・･\s]/g, "") === name);
    const aPriority = priority(a), bPriority = priority(b);
    return (aPriority < 0 ? cardTypePriority.length : aPriority) - (bPriority < 0 ? cardTypePriority.length : bPriority) || a.localeCompare(b, "ja");
  });
  const costOptions = allCosts;
  const visibleResults = results;
  const normalizedQuery = normalizeJapaneseSearch(query);
  const searchQuery = useMemo(() => query.trim(), [normalizedQuery]);
  const normalizedCardNumberFilter = cardNumberFilter.trim().toLowerCase();
  const searchCardNumberFilter = useMemo(() => cardNumberFilter.trim(), [normalizedCardNumberFilter]);
  const currentSearchKey = JSON.stringify({
    p_query: searchQuery,
    p_limit: SEARCH_PAGE_SIZE,
    p_offset: null,
    p_sort: searchSort,
    p_ascending: searchSortDirection === "asc",
    p_product_name: productFilter || null,
    p_card_number: searchCardNumberFilter || null,
    p_civilizations: civilizationFilter,
    p_civilization_mode: civilizationMode,
    p_color: colorFilter,
    p_card_types: cardTypeFilter ? [cardTypeFilter] : [],
    p_min_cost: minimumCost === "" ? null : Number(minimumCost),
    p_max_cost: maximumCost === "" ? null : Number(maximumCost),
    p_no_cost: includeNoCost,
    p_image: imageFilter,
  });
  const currentSearchStatus = searchStatusKey === currentSearchKey ? searchStatus : "searching";
  const resultsAreCurrent = resultsSearchKey === currentSearchKey;

  useEffect(() => { resultCountRef.current = results.length; }, [results]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    void supabase.rpc("deck_filter_options").then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || typeof data !== "object" || Array.isArray(data)) { setFilterOptionsError(true); return; }
      const products = Array.isArray(data.products) ? data.products : [];
      const names: string[] = [];
      const codes: Record<string, string[]> = {};
      for (const product of products) {
        if (!product || typeof product !== "object" || Array.isArray(product) || typeof product.name !== "string") continue;
        names.push(product.name);
        codes[product.name] = Array.isArray(product.codes) ? product.codes.filter((code): code is string => typeof code === "string") : [];
      }
      setAllProductNames(names.sort((a, b) => a.localeCompare(b, "ja")));
      setProductCodeByName(codes);
      setAllCardTypes(Array.isArray(data.cardTypes) ? data.cardTypes.filter((item): item is string => typeof item === "string") : []);
      setAllCosts(Array.isArray(data.costs) ? data.costs.filter((item): item is number => typeof item === "number").sort((a, b) => a - b) : []);
      setFilterOptionsError(false);
    });
    return () => { cancelled = true; };
  }, []);

  const loadSearchPage = useCallback(async (append: boolean, requestId: number, signal: AbortSignal) => {
    if (searchInFlightRef.current) return;
    searchInFlightRef.current = true;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      if (!append && requestId === searchRequestRef.current) {
        setSearchError("カード検索を利用できません。");
        setSearchStatus("error");
      }
      searchInFlightRef.current = false;
      return;
    }
    const offset = append ? resultCountRef.current : 0;
    const searchArgs = {
      p_query: searchQuery, p_limit: SEARCH_PAGE_SIZE, p_offset: offset, p_sort: searchSort,
      p_ascending: searchSortDirection === "asc",
      p_product_name: productFilter || null, p_card_number: searchCardNumberFilter || null,
      p_civilizations: civilizationFilter, p_civilization_mode: civilizationMode,
      p_color: colorFilter, p_card_types: cardTypeFilter ? [cardTypeFilter] : [],
      p_min_cost: minimumCost === "" ? null : Number(minimumCost),
      p_max_cost: maximumCost === "" ? null : Number(maximumCost),
      p_no_cost: includeNoCost, p_image: imageFilter,
    };
    const searchKey = JSON.stringify({ ...searchArgs, p_offset: null });
    let data;
    let error;
    try {
      ({ data, error } = await supabase.rpc("search_deck_cards_filtered", searchArgs).abortSignal(signal));
    } catch {
      if (requestId === searchRequestRef.current && !signal.aborted) {
        setSearchError("カード検索に失敗しました。もう一度お試しください。");
        setSearchStatus("error");
        searchInFlightRef.current = false;
      }
      return;
    }
    if (requestId !== searchRequestRef.current || signal.aborted) return;
    if (error) {
      setSearchError("カード検索に失敗しました。もう一度お試しください。");
      setSearchStatus("error");
      setHasMoreResults(false);
      searchInFlightRef.current = false;
      return;
    }
    const page = (data ?? [])
      .filter((row) => Number.isSafeInteger(row.id) && typeof row.name === "string")
      .map((row) => {
        const representativePrintId = Number.isSafeInteger(row.representative_print_id)
          ? row.representative_print_id
          : null;
        const imageUrl = typeof row.image_key === "string" ? getCardImageUrl(row.image_key) : null;
        return {
          id: row.id,
          name: row.name,
          name_kana: row.name_kana || null,
          print_count: row.print_count,
          usage_count: row.usage_count,
          cost: row.cost ?? fallbackCosts[row.name],
          civilizations: row.civilizations ?? [],
          cardTypes: row.card_types ?? [],
          imageUrl,
          imageOptions: imageUrl && representativePrintId !== null
            ? [{ printId: representativePrintId, url: imageUrl }]
            : [],
          productNames: [],
          cardNumbers: [],
          newestPrintId: representativePrintId ?? 0,
          hydrated: false,
        };
      });
    if (requestId !== searchRequestRef.current || signal.aborted) return;
    setResults((current) => append
      ? [...current, ...page.filter((card) => !current.some((existing) => existing.id === card.id))]
      : page);
    setResultsSearchKey(searchKey);
    setHasMoreResults(page.length === SEARCH_PAGE_SIZE);
    if (!append || page.length > 0) setSearchStatus(page.length > 0 ? "success" : append ? "success" : "empty");
    setSearchError(null);
    searchInFlightRef.current = false;
  }, [searchQuery, fallbackCosts, searchSort, searchSortDirection, productFilter, searchCardNumberFilter, civilizationFilter, civilizationMode, colorFilter, cardTypeFilter, minimumCost, maximumCost, includeNoCost, imageFilter]);

  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    searchInFlightRef.current = false;
    setHasMoreResults(true);
    setSearchStatusKey(currentSearchKey);
    setSearchStatus("searching");
    setSearchError(null);
    const timer = window.setTimeout(() => { void loadSearchPage(false, requestId, controller.signal); }, CARD_SEARCH_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [currentSearchKey, loadSearchPage]);

  function handleResultScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    if (resultsSearchKey === currentSearchKey && currentSearchStatus === "success" && hasMoreResults && !searchInFlightRef.current && target.scrollWidth - target.scrollLeft - target.clientWidth < 240) {
      const controller = searchControllerRef.current;
      if (controller) void loadSearchPage(true, searchRequestRef.current, controller.signal);
    }
  }

  function addCard(card: SearchCard, imageUrl = card.imageUrl) {
    const cardPrintId = card.imageOptions.find((option) => option.url === imageUrl)?.printId ?? null;
    setCards((current) => {
      const currentTotal = current.reduce((sum, item) => sum + item.quantity, 0);
      const existing = current.find((item) => item.canonicalCardId === card.id);
      if (currentTotal >= deckLimit || (existing?.quantity ?? 0) >= 4) return current;
      if (existing) return current.map((item) => item.canonicalCardId === card.id ? { ...item, cardPrintId, imageUrl, quantity: item.quantity + 1, cost: card.cost ?? item.cost, civilizations: card.civilizations?.length ? card.civilizations : item.civilizations } : item);
      return [...current, { canonicalCardId: card.id, cardPrintId, name: card.name, quantity: 1, imageUrl, cost: card.cost, civilizations: card.civilizations }];
    });
  }

  function removeCard(id: number) {
    setCards((current) => current.flatMap((card) => card.canonicalCardId !== id
      ? [card] : card.quantity <= 1 ? [] : [{ ...card, quantity: card.quantity - 1 }]));
  }

  function clearDeck() {
    if (cards.length === 0 || window.confirm("メインデッキのカードをすべて外しますか？")) setCards([]);
  }

  function closeCard() {
    cardDetailsRequestRef.current += 1;
    setSelectedCardDetailsLoading(false);
    setSelectedCard(null);
  }

  async function openCard(card: SearchCard) {
    const requestId = ++cardDetailsRequestRef.current;
    setSelectedCard(card);
    setSelectedImageUrl(cards.find((item) => item.canonicalCardId === card.id)?.imageUrl ?? card.imageUrl);
    if (card.hydrated) {
      setSelectedCardDetailsLoading(false);
      return;
    }

    setSelectedCardDetailsLoading(true);
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setSelectedCardDetailsLoading(false);
      return;
    }
    const { data: prints, error } = await supabase
      .from("card_prints")
      .select("id, image_key, product_name, card_number, official_card_id")
      .eq("canonical_card_id", card.id)
      .is("deleted_at", null)
      .order("id");
    if (requestId !== cardDetailsRequestRef.current) return;
    setSelectedCardDetailsLoading(false);
    if (error) return;

    const orderedPrints = sortCardPrintsOldestFirst(prints ?? []);
    const imageOptions = orderedPrints.flatMap((print) => {
      const url = getCardImageUrl(print.image_key);
      return url ? [{ printId: print.id, url }] : [];
    });
    const hydratedCard: SearchCard = {
      ...card,
      imageUrl: card.imageUrl ?? imageOptions[0]?.url ?? null,
      imageOptions,
      productNames: [...new Set(orderedPrints.flatMap((print) => print.product_name ? [print.product_name] : []))],
      cardNumbers: [...new Set(orderedPrints.flatMap((print) => print.card_number ? [print.card_number] : []))],
      newestPrintId: Math.max(0, ...orderedPrints.map((print) => print.id)),
      hydrated: true,
    };
    setSelectedCard(hydratedCard);
    setSelectedImageUrl((current) => current ?? hydratedCard.imageUrl);
    setResults((current) => current.map((item) => item.id === card.id ? hydratedCard : item));
  }

  async function openDeckCard(card: SelectedCard) {
    const searchCard = results.find((item) => item.id === card.canonicalCardId);
    if (searchCard) return openCard(searchCard);
    const supabase = createBrowserSupabaseClient();
    const { data: prints } = supabase ? await supabase.from("card_prints").select("id, image_key, product_name, card_number, official_card_id").eq("canonical_card_id", card.canonicalCardId).not("image_key", "is", null).order("id") : { data: [] };
    const orderedPrints = sortCardPrintsOldestFirst(prints ?? []);
    const imageOptions = orderedPrints.flatMap((print) => { const url = getCardImageUrl(print.image_key); return url ? [{ printId: print.id, url }] : []; });
    openCard({
      id: card.canonicalCardId,
      name: card.name,
      name_kana: null,
      print_count: card.imageUrl ? 1 : 0,
      imageUrl: card.imageUrl,
      imageOptions,
      productNames: [...new Set(orderedPrints.flatMap((print) => print.product_name ? [print.product_name] : []))],
      cardTypes: [],
      cardNumbers: [...new Set(orderedPrints.flatMap((print) => print.card_number ? [print.card_number] : []))],
      newestPrintId: Math.max(0, ...(prints ?? []).map((print) => print.id)),
      cost: card.cost,
      civilizations: card.civilizations,
      hydrated: true,
    });
  }

  function unifyIllustration() {
    if (!selectedCard || !selectedImageUrl) return;
    const cardPrintId = selectedCard.imageOptions.find((option) => option.url === selectedImageUrl)?.printId ?? null;
    setCards((current) => current.map((card) => card.canonicalCardId === selectedCard.id ? { ...card, cardPrintId, imageUrl: selectedImageUrl } : card));
  }

  function selectIllustration(option: ImageOption) {
    setSelectedImageUrl(option.url);
    if (!selectedCard) return;
    setCards((current) => current.map((card) => card.canonicalCardId === selectedCard.id
      ? { ...card, cardPrintId: option.printId, imageUrl: option.url }
      : card));
  }

  return (
    <form action={formAction} className="deck-maker-form" onSubmit={() => { if (initialDeck) invalidateDeckPreviewCache(initialDeck.id); }}>
      <header className="deck-maker-toolbar">
        <label className="deck-maker-name"><span className="deck-maker-name-label">デッキ名</span><span className="deck-maker-name-input"><input defaultValue={initialDeck?.name} maxLength={60} name="name" placeholder="デッキ名を入力" required /><span aria-hidden="true" className="deck-maker-name-edit-icon">✎</span></span></label>
        <div className="deck-maker-actions">
          <button onClick={() => setSettingsOpen((open) => !open)} type="button"><span aria-hidden="true" className="deck-action-icon">⚙</span><span className="deck-action-label">設定</span></button>
          <button onClick={clearDeck} type="button"><span aria-hidden="true" className="deck-action-icon"><span className="ui-icon ui-icon-trash" /></span><span className="deck-action-label">全解除</span></button>
          <button aria-haspopup="dialog" className="deck-analysis-button" onClick={() => setAnalysisOpen(true)} type="button"><img alt="" className="deck-action-icon" src="/icons/analysis_icon.svg" /><span className="deck-action-label">分析</span></button>
          <button className="deck-save-button" disabled={pending} type="submit"><span aria-hidden="true" className="deck-action-icon">▣</span><span className="deck-action-label">{pending ? "保存中" : "保存"}</span></button>
        </div>
      </header>
      {analysisOpen ? <DeckAnalysis cards={cards} onClose={() => setAnalysisOpen(false)} /> : null}

      <section className="deck-maker-settings" hidden={!settingsOpen}>
        <label>フォーマット<select name="format" onChange={(event) => setFormat(event.target.value as DeckEditorInitialData["format"])} value={format}><option value="original">オリジナル</option><option value="advanced">アドバンス</option><option value="duel_party">デュエパーティ</option></select></label>
        <label>公開範囲<select name="visibility" defaultValue={initialDeck?.visibility ?? "private"}><option value="private">非公開</option><option value="unlisted">URL限定</option><option value="public">公開</option></select></label>
        <label className="deck-description-field">説明<textarea defaultValue={initialDeck?.description} maxLength={1000} name="description" placeholder="デッキのメモ（任意）" rows={2} /></label>
      </section>

      <div className="deck-maker-layout">
        <section className="deck-maker-deck-panel">
          <nav aria-label="デッキのカード種別" className="deck-maker-tabs">
            <button aria-selected={activeTab === "main"} onClick={() => setActiveTab("main")} role="tab" type="button">メイン <strong>{total}</strong></button>
            <button aria-selected={activeTab === "gr"} onClick={() => setActiveTab("gr")} role="tab" type="button">GR / 超次元 <strong>0</strong></button>
            <button aria-selected={activeTab === "special"} onClick={() => setActiveTab("special")} role="tab" type="button">特殊</button>
            <div className="deck-maker-count"><strong className={total === deckLimit ? "complete" : total > deckLimit ? "over" : ""}>{total}<small>/{deckLimit}</small></strong></div>
          </nav>

          <section className="deck-maker-canvas">
        {activeTab === "main" ? <>
          {expandedCards.length === 0 ? <div className="deck-maker-empty"><strong>カードがまだありません</strong><span>下の検索欄からカードを追加してください</span></div> :
            <div className="deck-maker-grid">{expandedCards.map((card) => (
              <button aria-label={`${card.name}の詳細を開く`} className="deck-maker-card" key={`${card.canonicalCardId}-${card.copyIndex}`} onClick={() => openDeckCard(card)} title={`${card.name}の詳細を開く`} type="button">
                <CardArtwork eager imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 600px) 20vw, 120px" />
              </button>
            ))}</div>}
        </> : <div className="deck-maker-empty"><strong>{activeTab === "gr" ? "GR / 超次元ゾーン" : "特殊ゾーン"}</strong><span>このゾーンのカード登録は次の実装で対応します</span></div>}
          </section>
        </section>

        <aside className="deck-maker-desktop-side">
          <DeckAnalysis cards={cards} inline />
          <section className="deck-search-shelf">
        <div aria-busy={currentSearchStatus === "searching"} className="deck-result-strip" aria-live="polite" onScroll={handleResultScroll}>
          {currentSearchStatus === "searching" ? <p role="status">{visibleResults.length > 0 && !resultsAreCurrent ? "検索中… 前の結果は操作できません" : "検索中…"}</p> : null}
          {currentSearchStatus === "error" ? <p role="alert">{searchError ?? "カード検索に失敗しました。もう一度お試しください。"}</p> : null}
          {currentSearchStatus === "empty" ? <p>条件に一致するカードがありません</p> : null}
          {currentSearchStatus !== "error" && visibleResults.map((card, index) => {
            const quantity = cards.find((item) => item.canonicalCardId === card.id)?.quantity ?? 0;
            const cannotAdd = total >= deckLimit || quantity >= 4;
            return <article className="deck-result-card" key={card.id}>
              <button aria-label={`${card.name}の詳細を開く`} className="deck-result-card-art" disabled={!resultsAreCurrent} onClick={() => void openCard(card)} title={`${card.name}の詳細を開く`} type="button">
                <CardArtwork eager={index === 0} imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 760px) 84px, 180px" />
                {quantity > 0 ? <strong>{quantity}</strong> : null}
              </button>
              <span className="deck-result-card-name">{card.name}</span>
              <div className="deck-result-card-actions" aria-label={`${card.name}をデッキで増減`}>
                <button aria-label={`${card.name}を1枚減らす`} disabled={quantity === 0} onClick={() => removeCard(card.id)} type="button">−</button>
                <button aria-label={`${card.name}を1枚増やす`} disabled={!resultsAreCurrent || cannotAdd} onClick={() => addCard(card)} type="button">＋</button>
              </div>
            </article>;
          })}
        </div>
        <div className="deck-search-bar"><div className="deck-search-input-row"><span aria-hidden="true">⌕</span>
          <input aria-label="カード名" placeholder="カード名で検索" value={query} onChange={cardSearchInput.onChange} onCompositionStart={cardSearchInput.onCompositionStart} onCompositionEnd={cardSearchInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, cardSearchInput.isComposing())) event.preventDefault(); }} />
        </div><div className="deck-search-controls-row">
          <div aria-label="文明で絞り込む" className="deck-search-civilizations">{[["", "すべて"], ["light", "光"], ["water", "水"], ["darkness", "闇"], ["fire", "火"], ["nature", "自然"], ["zero", "ゼロ"]].map(([value, label]) => <button aria-pressed={value ? civilizationFilter.includes(value) : civilizationFilter.length === 0} key={value || "all"} onClick={() => setCivilizationFilter((current) => value ? current.includes(value) ? current.filter((item) => item !== value) : [...current, value] : [])} type="button">{label}</button>)}</div>
          <div className="deck-search-actions"><select aria-label="検索結果の並び順" className="deck-search-sort-select" onChange={(event) => { const [sort, direction] = event.target.value.split(":") as [DeckSearchSortKey, SortDirection]; setSearchSort(sort); setSearchSortDirection(direction); }} value={`${searchSort}:${searchSortDirection}`}><option value="usage:desc">使用数順</option><option value="usage:asc">使用数順（昇順）</option><option value="relevance:asc">検索順</option><option value="name:asc">カード名順</option><option value="name:desc">カード名順（降順）</option><option value="release_date:desc">発売日順</option><option value="release_date:asc">発売日順（昇順）</option></select>
          <button aria-expanded={filterOpen} onClick={() => { setFilterOpen((open) => !open); setSortOpen(false); }} type="button"><span aria-hidden="true">☷</span> 絞り込み</button>
          <button className="deck-mobile-sort-button" aria-expanded={sortOpen} onClick={() => { setSortOpen((open) => !open); setFilterOpen(false); }} type="button"><span aria-hidden="true">↕</span> 並べ替え</button></div>
        </div>
        </div>
        {filterOpen ? <section className="deck-filter-popover" aria-label="カードの絞り込み">
          <div className="deck-popover-heading"><strong>絞り込み</strong><button aria-label="絞り込みを閉じる" onClick={() => setFilterOpen(false)} type="button">×</button></div>
          {filterOptionsError ? <p role="alert">絞り込み候補を読み込めませんでした。</p> : null}
          <div className="deck-filter-field"><strong>文明</strong><div className="deck-filter-buttons">{[["fire", "火"], ["water", "水"], ["nature", "自然"], ["light", "光"], ["darkness", "闇"], ["zero", "ゼロ"]].map(([value, label]) => <button aria-pressed={civilizationFilter.includes(value)} key={value} onClick={() => setCivilizationFilter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} type="button">{label}</button>)}</div></div>
          <div className="deck-filter-field"><strong>文明の条件</strong><div className="deck-filter-buttons"><button aria-pressed={civilizationMode === "cup"} onClick={() => setCivilizationMode("cup")} type="button">∪ いずれか</button><button aria-pressed={civilizationMode === "cap"} onClick={() => setCivilizationMode("cap")} type="button">∩ すべて</button></div></div>
          <fieldset><legend>色数</legend>{[["all", "すべて"], ["single", "単色のみ"], ["multi", "多色のみ"]].map(([value, label]) => <label key={value}><input checked={colorFilter === value} name="color-filter" onChange={() => setColorFilter(value as typeof colorFilter)} type="radio" />{label}</label>)}</fieldset>
          <div className="deck-filter-field"><strong>コスト</strong><div className="deck-cost-range"><select aria-label="最小コスト" onChange={(event) => setMinimumCost(event.target.value)} value={minimumCost}><option value="">最小 未指定</option>{costOptions.map((cost) => <option key={cost} value={cost}>{cost}</option>)}</select><span>～</span><select aria-label="最大コスト" onChange={(event) => setMaximumCost(event.target.value)} value={maximumCost}><option value="">最大 未指定</option>{costOptions.map((cost) => <option key={cost} value={cost}>{cost}</option>)}</select></div></div>
          <label className="deck-filter-no-cost"><input checked={includeNoCost} onChange={(event) => setIncludeNoCost(event.target.checked)} type="checkbox" />コストなしを含める</label>
          <div className="deck-filter-field"><strong>カードタイプ</strong><div className="deck-card-type-picker"><button aria-expanded={cardTypeListOpen} onClick={() => setCardTypeListOpen((open) => !open)} type="button">{cardTypeFilter || "指定なし"} <span aria-hidden="true" className="ui-icon ui-icon-dropdown" /></button>{cardTypeListOpen ? <div className="deck-card-type-options"><button onClick={() => { setCardTypeFilter(""); setCardTypeListOpen(false); }} type="button">指定なし</button>{cardTypeOptions.map((value) => <button aria-selected={cardTypeFilter === value} key={value} onClick={() => { setCardTypeFilter(value); setCardTypeListOpen(false); }} type="button">{value}</button>)}</div> : null}</div></div>
          <div className="deck-filter-field"><strong>収録商品</strong><div className="deck-product-picker"><div className="deck-product-input"><input aria-label="収録商品を検索" placeholder={productFilter || "商品名・商品コードで検索"} value={productQuery} onFocus={() => setProductListOpen(true)} onChange={(event) => { productSearchInput.onChange(event); setProductListOpen(true); }} onCompositionStart={productSearchInput.onCompositionStart} onCompositionEnd={productSearchInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, productSearchInput.isComposing())) event.preventDefault(); }} /><button aria-label="収録商品をすべてに戻す" onClick={() => { setProductFilter(""); productSearchInput.setValue(""); setProductListOpen(false); }} type="button">{productFilter ? "×" : "すべて"}</button></div>{productListOpen ? <div className="deck-product-options"><button onClick={() => { setProductFilter(""); productSearchInput.setValue(""); setProductListOpen(false); }} type="button">すべて</button>{matchingProducts.map((name) => <button aria-selected={productFilter === name} key={name} onClick={() => { setProductFilter(name); productSearchInput.setValue(""); setProductListOpen(false); }} type="button">{name}{productCodeByName[name]?.length ? <small>{productCodeByName[name].join(" / ")}</small> : null}</button>)}{matchingProducts.length === 0 ? <p>該当する収録商品がありません</p> : null}</div> : null}</div></div>
          <label>カード番号<input placeholder="例：DM24-RP1" value={cardNumberFilter} onChange={cardNumberSearchInput.onChange} onCompositionStart={cardNumberSearchInput.onCompositionStart} onCompositionEnd={cardNumberSearchInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, cardNumberSearchInput.isComposing())) event.preventDefault(); }} /></label>
          <button className="deck-filter-clear" onClick={() => { setProductFilter(""); productSearchInput.setValue(""); setProductListOpen(false); cardNumberSearchInput.setValue(""); setCivilizationFilter([]); setCivilizationMode("cup"); setColorFilter("all"); setCardTypeFilter(""); setCardTypeListOpen(false); setMinimumCost(""); setMaximumCost(""); setIncludeNoCost(false); }} type="button">全条件クリア</button>
        </section> : null}
        {sortOpen ? <section className="deck-sort-modal-backdrop" onClick={() => setSortOpen(false)} role="presentation"><div aria-label="並べ替え方法選択" aria-modal="true" className="deck-sort-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="deck-popover-heading"><strong>並べ替え方法選択</strong><button aria-label="並べ替えを閉じる" onClick={() => setSortOpen(false)} type="button">×</button></div>
          <div className="deck-sort-section-heading"><h3>デッキ並べ替え</h3><button aria-label="デッキの昇順と降順を切り替える" className="deck-sort-direction" onClick={() => { setDeckSort((current) => current ?? "cost"); setDeckSortDirection((direction) => direction === "asc" ? "desc" : "asc"); }} type="button">{deckSortDirection === "asc" ? "↑ 昇順" : "↓ 降順"}</button></div><div className="deck-sort-options"><button className={deckSort === "cost" ? "active" : ""} onClick={() => setDeckSort("cost")} type="button">コスト順</button><button className={deckSort === "added" ? "active" : ""} onClick={() => setDeckSort("added")} type="button">追加順</button><button className={deckSort === "name" ? "active" : ""} onClick={() => setDeckSort("name")} type="button">カード名順</button><button className={deckSort === "quantity" ? "active" : ""} onClick={() => setDeckSort("quantity")} type="button">枚数順</button></div>
          <div className="deck-sort-section-heading"><h3>検索結果並べ替え</h3><button aria-label="検索結果の昇順と降順を切り替える" className="deck-sort-direction" onClick={() => setSearchSortDirection((direction) => direction === "asc" ? "desc" : "asc")} type="button">{searchSortDirection === "asc" ? "↑ 昇順" : "↓ 降順"}</button></div><div className="deck-sort-options search"><button className={searchSort === "relevance" ? "active" : ""} onClick={() => { setSearchSort("relevance"); setSearchSortDirection("asc"); }} type="button">検索順</button><button className={searchSort === "name" ? "active" : ""} onClick={() => setSearchSort("name")} type="button">カード名順</button><button className={searchSort === "release_date" ? "active" : ""} onClick={() => { setSearchSort("release_date"); setSearchSortDirection("desc"); }} type="button">発売日順</button><button className={searchSort === "usage" ? "active" : ""} onClick={() => { setSearchSort("usage"); setSearchSortDirection("desc"); }} type="button">使用数順</button></div>
        </div></section> : null}
          </section>
        </aside>
      </div>

      {selectedCard ? <div className="deck-card-modal-backdrop" onClick={closeCard} role="presentation">
        <section aria-label={`${selectedCard.name}のカード詳細`} aria-modal="true" className="deck-card-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="deck-card-modal-main">
            <CardArtwork className="deck-card-modal-art" eager imageUrl={selectedImageUrl} name={selectedCard.name} sizes="(max-width: 600px) 88vw, 430px" />
          </div>
          <div className="deck-card-variants" aria-label="別イラスト一覧">
            {selectedCardDetailsLoading ? <p role="status">イラストを読み込み中…</p> : selectedCard.imageOptions.length > 0 ? selectedCard.imageOptions.map((option, index) => <button aria-label={`イラスト${index + 1}を選択`} aria-pressed={selectedImageUrl === option.url} key={option.printId} onClick={() => selectIllustration(option)} type="button">
              <CardArtwork eager imageUrl={option.url} name={`${selectedCard.name} イラスト${index + 1}`} sizes="90px" />
            </button>) : <p>別イラスト画像はまだ登録されていません。</p>}
          </div>
          <div className="deck-card-modal-controls">
            <button className="deck-card-modal-unify" disabled={!cards.some((item) => item.canonicalCardId === selectedCard.id) || !selectedImageUrl} onClick={unifyIllustration} type="button"><span aria-hidden="true">▣</span>イラストを統一</button>
            <div><small>デッキ内</small><span>
              <button aria-label="1枚減らす" disabled={!cards.some((item) => item.canonicalCardId === selectedCard.id)} onClick={() => removeCard(selectedCard.id)} type="button">−</button>
              <strong>{cards.find((item) => item.canonicalCardId === selectedCard.id)?.quantity ?? 0}<small>/4枚</small></strong>
              <button aria-label="1枚増やす" disabled={total >= deckLimit || (cards.find((item) => item.canonicalCardId === selectedCard.id)?.quantity ?? 0) >= 4} onClick={() => addCard(selectedCard, selectedImageUrl)} type="button">＋</button>
            </span></div>
            <button className="deck-card-modal-close" onClick={closeCard} type="button"><span aria-hidden="true">×</span>閉じる</button>
          </div>
        </section>
      </div> : null}

      <input name="cards" type="hidden" value={JSON.stringify(orderedCards)} />
      {state.status === "error" ? <p className="notice error deck-maker-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
