"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { createDeckAction, updateDeckAction } from "@/app/decks/actions";
import { initialDeckActionState } from "@/app/decks/action-state";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { pickCardPrintRepresentativesByCanonicalCardId, sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { mapDeckSearchResults, type DeckSearchCard } from "@/lib/deck-search-mapping";
import { invalidateDeckPreviewCache } from "@/lib/deck-preview-cache";
import { getInitialEditorSort, restoreEditorCards, type EditorSortKey, sortDeckCards, type DeckSortKey, type SortDirection } from "@/lib/deck-sorting";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { CARD_SEARCH_DEBOUNCE_MS } from "@/lib/search-timing";
import { DeckAnalysis } from "@/components/deck-analysis";
import { getDeckCardAddCount, MAX_COPIES_PER_CARD, MAX_MAIN_DECK_CARDS } from "@/lib/deck-validation";
import { constrainDeckPanePercent, DECK_EDITOR_LAYOUT, getAnalysisTrackPercent, getDeckPreviewMinimumWidth, resolveAnalysisResize } from "@/lib/deck-editor-layout";
import { isImeCompositionEnter, useImeRealtimeInput } from "@/lib/use-ime-realtime-input";
import { normalizeJapaneseSearch } from "@/lib/search-normalization";

type ImageOption = { printId: number; url: string };
type SearchCard = DeckSearchCard;
type SelectedCard = { canonicalCardId: number; cardPrintId: number | null; name: string; quantity: number; imageUrl: string | null; cost?: number | null; civilizations?: string[] };
type DeckTab = "main" | "gr" | "special";
type DeckSearchSortKey = "relevance" | "name" | "release_date" | "usage";
type SearchStatus = "idle" | "searching" | "success" | "empty" | "error";
export type DeckEditorInitialData = { id: string; name: string; format: "original" | "advanced" | "duel_party"; visibility: "private" | "unlisted" | "public"; description: string; editorSortKey?: EditorSortKey; editorSortDirection?: SortDirection; cards: SelectedCard[] };
const SEARCH_PAGE_SIZE = 24;
const QUICK_RACE_TOKENS = ["コマンド", "ドラゴン"] as const;

function getRaceTokens(value: string) {
  return value.split(/[・･·、/\s]+/u).map((token) => token.trim()).filter(Boolean);
}

export function DeckEditor({ initialDeck, fallbackCosts = {} }: { initialDeck?: DeckEditorInitialData; fallbackCosts?: Record<string, number> }) {
  const submitAction = useMemo(() => initialDeck ? updateDeckAction.bind(null, initialDeck.id) : createDeckAction, [initialDeck]);
  const [state, formAction, pending] = useActionState(submitAction, initialDeckActionState);
  const cardSearchInput = useImeRealtimeInput();
  const query = cardSearchInput.value;
  const [results, setResults] = useState<SearchCard[]>([]);
  const initialSort = getInitialEditorSort(initialDeck);
  const [cards, setCards] = useState<SelectedCard[]>(() => restoreEditorCards(initialDeck?.cards ?? [], initialSort.key, initialSort.direction));
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
  const [productDraft, setProductDraft] = useState("");
  const [allRaces, setAllRaces] = useState<string[]>([]);
  const [civilizationFilter, setCivilizationFilter] = useState<string[]>([]);
  const [civilizationMode, setCivilizationMode] = useState<"cup" | "cap">("cup");
  const [colorFilter, setColorFilter] = useState<"all" | "single" | "multi">("all");
  const [cardTypeFilter, setCardTypeFilter] = useState("");
  const [cardTypeListOpen, setCardTypeListOpen] = useState(false);
  const [minimumCost, setMinimumCost] = useState("");
  const [maximumCost, setMaximumCost] = useState("");
  const [minimumPower, setMinimumPower] = useState("");
  const [maximumPower, setMaximumPower] = useState("");
  const [selectedRaceTokens, setSelectedRaceTokens] = useState<string[]>([]);
  const [raceDraftTokens, setRaceDraftTokens] = useState<string[]>([]);
  const [racePickerOpen, setRacePickerOpen] = useState(false);
  const [raceSearch, setRaceSearch] = useState("");
  const [cardTextQuery, setCardTextQuery] = useState("");
  const [includeNoCost, setIncludeNoCost] = useState(false);
  const [imageFilter, setImageFilter] = useState<"all" | "with" | "without">("all");
  const [searchSort, setSearchSort] = useState<DeckSearchSortKey>("relevance");
  const [searchSortDirection, setSearchSortDirection] = useState<SortDirection>("asc");
  // A new deck has no persisted order yet, so keep the historical cost-ascending default.
  // Existing decks continue to render their saved sort_order unchanged.
  const [deckSort, setDeckSort] = useState<DeckSortKey | null>(initialSort.key === "saved" ? null : initialSort.key);
  const [deckSortDirection, setDeckSortDirection] = useState<SortDirection>(initialSort.direction);
  const [deckPanePercent, setDeckPanePercent] = useState(36);
  const [analysisPanePercent, setAnalysisPanePercent] = useState(40);
  const [searchOverlap, setSearchOverlap] = useState(0);
  const [layoutSize, setLayoutSize] = useState({ width: 0, height: 0 });
  const layoutRef = useRef<HTMLDivElement>(null);
  const deckPaneRef = useRef<HTMLElement>(null);
  const desktopSideRef = useRef<HTMLElement>(null);
  const analysisSplitterRef = useRef<HTMLDivElement>(null);
  const resultStripRef = useRef<HTMLDivElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLElement>(null);
  const paneResizeRef = useRef<{ axis: "deck" | "analysis"; pointerId: number; startCoordinate: number; startPercent: number; startBoundaryCenter: number; availableSize: number } | null>(null);
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
    p_min_power: minimumPower.trim() === "" ? null : Number(minimumPower),
    p_max_power: maximumPower.trim() === "" ? null : Number(maximumPower),
    p_race_tokens: selectedRaceTokens,
    p_card_text_query: cardTextQuery.trim() || null,
    p_no_cost: includeNoCost,
    p_image: imageFilter,
  });
  const currentSearchStatus = searchStatusKey === currentSearchKey ? searchStatus : "searching";
  const resultsAreCurrent = resultsSearchKey === currentSearchKey;

  useEffect(() => { resultCountRef.current = results.length; }, [results]);

  useEffect(() => {
    if (!filterOpen || !searchBarRef.current || !layoutRef.current) return;
    const updateFilterPosition = () => {
      filterPopoverRef.current?.style.setProperty("--deck-search-top", `${searchBarRef.current!.getBoundingClientRect().top}px`);
    };
    updateFilterPosition();
    const observer = new ResizeObserver(updateFilterPosition);
    observer.observe(layoutRef.current);
    observer.observe(searchBarRef.current);
    window.addEventListener("resize", updateFilterPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFilterPosition);
    };
  }, [filterOpen]);

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
      setAllRaces(Array.isArray(data.races) ? data.races.filter((item): item is string => typeof item === "string").sort((a, b) => a.localeCompare(b, "ja")) : []);
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
      p_min_power: minimumPower.trim() === "" ? null : Number(minimumPower),
      p_max_power: maximumPower.trim() === "" ? null : Number(maximumPower),
      p_race_tokens: selectedRaceTokens,
      p_card_text_query: cardTextQuery.trim() || null,
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
        .abortSignal(signal),
    );
    let printResults: Awaited<(typeof printQueries)[number]>[] = [];
    try {
      printResults = await Promise.all(printQueries);
    } catch {
      // Keep usable search results if the optional artwork batch fails.
    }
    if (requestId !== searchRequestRef.current || signal.aborted) return;
    const representatives = pickCardPrintRepresentativesByCanonicalCardId(
      printResults.flatMap(({ data: prints }) => prints ?? []),
    );
    const page = mapDeckSearchResults(data, representatives, fallbackCosts);
    if (requestId !== searchRequestRef.current || signal.aborted) return;
    setResults((current) => append
      ? [...current, ...page.filter((card) => !current.some((existing) => existing.id === card.id))]
      : page);
    setResultsSearchKey(searchKey);
    setHasMoreResults(page.length === SEARCH_PAGE_SIZE);
    if (!append || page.length > 0) setSearchStatus(page.length > 0 ? "success" : append ? "success" : "empty");
    setSearchError(null);
    searchInFlightRef.current = false;
  }, [searchQuery, fallbackCosts, searchSort, searchSortDirection, productFilter, searchCardNumberFilter, civilizationFilter, civilizationMode, colorFilter, cardTypeFilter, minimumCost, maximumCost, minimumPower, maximumPower, selectedRaceTokens, cardTextQuery, includeNoCost, imageFilter]);

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

  useEffect(() => {
    const target = layoutRef.current;
    if (!target) return;
    const updateLayoutSize = () => {
      const rect = target.getBoundingClientRect();
      const deckHeight = deckPaneRef.current?.getBoundingClientRect().height ?? 0;
      const next = { width: Math.round(rect.width), height: Math.round(Math.max(rect.height, deckHeight + DECK_EDITOR_LAYOUT.layoutPadding * 2)) };
      setLayoutSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    updateLayoutSize();
    const observer = new ResizeObserver(updateLayoutSize);
    observer.observe(target);
    if (deckPaneRef.current) observer.observe(deckPaneRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = resultStripRef.current;
    if (!target || !window.matchMedia("(min-width: 761px)").matches) return;
    const loadWhenSpaceIsAvailable = () => {
      if (resultsSearchKey !== currentSearchKey || currentSearchStatus !== "success" || !hasMoreResults || searchInFlightRef.current) return;
      if (target.scrollHeight - target.clientHeight > 240) return;
      const controller = searchControllerRef.current;
      if (controller) void loadSearchPage(true, searchRequestRef.current, controller.signal);
    };
    loadWhenSpaceIsAvailable();
    const observer = new ResizeObserver(loadWhenSpaceIsAvailable);
    observer.observe(target);
    return () => observer.disconnect();
  }, [analysisPanePercent, currentSearchKey, currentSearchStatus, deckPanePercent, hasMoreResults, loadSearchPage, results.length, resultsSearchKey]);

  function handleResultScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const remainingScroll = window.matchMedia("(min-width: 761px)").matches
      ? target.scrollHeight - target.scrollTop - target.clientHeight
      : target.scrollWidth - target.scrollLeft - target.clientWidth;
    if (resultsSearchKey === currentSearchKey && currentSearchStatus === "success" && hasMoreResults && !searchInFlightRef.current && remainingScroll < 240) {
      const controller = searchControllerRef.current;
      if (controller) void loadSearchPage(true, searchRequestRef.current, controller.signal);
    }
  }

  function getPaneAvailableSize(axis: "deck" | "analysis") {
    if (axis === "deck") {
      const width = layoutRef.current?.getBoundingClientRect().width ?? 0;
      return Math.max(0, width - DECK_EDITOR_LAYOUT.layoutPadding * 2 - DECK_EDITOR_LAYOUT.splitterSize);
    }
    const height = desktopSideRef.current?.getBoundingClientRect().height ?? 0;
    return Math.max(0, height - DECK_EDITOR_LAYOUT.splitterSize);
  }

  function beginPaneResize(axis: "deck" | "analysis", event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const availableSize = getPaneAvailableSize(axis);
    if (availableSize <= 0) return;
    const deckWidth = deckPaneRef.current?.getBoundingClientRect().width;
    const sideRect = desktopSideRef.current?.getBoundingClientRect();
    const splitterRect = event.currentTarget.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    paneResizeRef.current = {
      axis,
      pointerId: event.pointerId,
      startCoordinate: axis === "deck" ? event.clientX : event.clientY,
      startPercent: axis === "deck" && deckWidth ? deckWidth / availableSize * 100 : deckPanePercent,
      startBoundaryCenter: axis === "analysis" && sideRect ? splitterRect.top + splitterRect.height / 2 - sideRect.top : 0,
      availableSize,
    };
  }

  function movePaneResize(event: React.PointerEvent<HTMLDivElement>) {
    const resize = paneResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const coordinate = resize.axis === "deck" ? event.clientX : event.clientY;
    const delta = (coordinate - resize.startCoordinate) / resize.availableSize * 100;
    if (resize.axis === "deck") {
      const layoutRect = layoutRef.current?.getBoundingClientRect();
      if (!layoutRect) return;
      setDeckPanePercent(constrainDeckPanePercent(resize.startPercent + delta, layoutRect.width, layoutRect.height));
      return;
    }
    const sideHeight = desktopSideRef.current?.getBoundingClientRect().height ?? 0;
    const next = resolveAnalysisResize(sideHeight, resize.startBoundaryCenter + coordinate - resize.startCoordinate);
    setAnalysisPanePercent(getAnalysisTrackPercent(next.analysisHeight, sideHeight));
    setSearchOverlap(next.searchOverlap);
  }

  function endPaneResize(event: React.PointerEvent<HTMLDivElement>) {
    if (paneResizeRef.current?.pointerId === event.pointerId) paneResizeRef.current = null;
  }

  function adjustPaneResize(axis: "deck" | "analysis", delta: number) {
    if (axis === "deck") {
      const layoutRect = layoutRef.current?.getBoundingClientRect();
      if (layoutRect) setDeckPanePercent((current) => constrainDeckPanePercent(current + delta, layoutRect.width, layoutRect.height));
      return;
    }
    const sideRect = desktopSideRef.current?.getBoundingClientRect();
    const splitterRect = eventSplitterRect();
    if (!sideRect || !splitterRect) return;
    const currentCenter = splitterRect.top + splitterRect.height / 2 - sideRect.top;
    const next = resolveAnalysisResize(sideRect.height, currentCenter + sideRect.height * delta / 100);
    setAnalysisPanePercent(getAnalysisTrackPercent(next.analysisHeight, sideRect.height));
    setSearchOverlap(next.searchOverlap);
  }

  function eventSplitterRect() {
    return analysisSplitterRef.current?.getBoundingClientRect() ?? null;
  }

  function handlePaneResizeKeyDown(axis: "deck" | "analysis", event: React.KeyboardEvent<HTMLDivElement>) {
    const increaseKey = axis === "deck" ? "ArrowRight" : "ArrowDown";
    const decreaseKey = axis === "deck" ? "ArrowLeft" : "ArrowUp";
    if (event.key !== increaseKey && event.key !== decreaseKey) return;
    event.preventDefault();
    adjustPaneResize(axis, event.key === increaseKey ? 2 : -2);
  }

  const deckLayoutStyle = {
    "--deck-left-track": `${deckPanePercent}fr`,
    "--deck-right-track": `${100 - deckPanePercent}fr`,
    "--deck-analysis-track": `${analysisPanePercent}fr`,
    "--deck-search-track": `${100 - analysisPanePercent}fr`,
    "--deck-left-min": `${getDeckPreviewMinimumWidth(layoutSize.width, layoutSize.height)}px`,
    "--deck-analysis-min-height": `${DECK_EDITOR_LAYOUT.analysisMinimumHeight}px`,
    "--deck-search-overlap": `${searchOverlap}px`,
  } as CSSProperties;

  function addCard(card: SearchCard, imageUrl = card.imageUrl, requestedQuantity = 1) {
    const cardPrintId = card.imageOptions.find((option) => option.url === imageUrl)?.printId ?? null;
    setCards((current) => {
      const currentTotal = current.reduce((sum, item) => sum + item.quantity, 0);
      const existing = current.find((item) => item.canonicalCardId === card.id);
      const addCount = getDeckCardAddCount(currentTotal, existing?.quantity ?? 0, requestedQuantity, deckLimit);
      if (addCount === 0) return current;
      if (existing) return current.map((item) => item.canonicalCardId === card.id ? { ...item, cardPrintId, imageUrl, quantity: item.quantity + addCount, cost: card.cost ?? item.cost, civilizations: card.civilizations?.length ? card.civilizations : item.civilizations } : item);
      return [...current, { canonicalCardId: card.id, cardPrintId, name: card.name, quantity: addCount, imageUrl, cost: card.cost, civilizations: card.civilizations }];
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

      <div className="deck-maker-layout" ref={layoutRef} style={deckLayoutStyle}>
        <section className="deck-maker-deck-panel" ref={deckPaneRef}>
          <nav aria-label="デッキのカード種別" className="deck-maker-tabs">
            <button aria-selected={activeTab === "main"} onClick={() => setActiveTab("main")} role="tab" type="button">メイン <strong>{total}</strong></button>
            <button aria-selected={activeTab === "gr"} onClick={() => setActiveTab("gr")} role="tab" type="button">GR / 超次元 <strong>0</strong></button>
            <button aria-selected={activeTab === "special"} onClick={() => setActiveTab("special")} role="tab" type="button">特殊</button>
            <div className="deck-preview-sort-controls">
              <span className="deck-preview-sort-label">デッキ順</span>
              <select aria-label="デッキの並び順" onChange={(event) => {
                const [sort, direction] = event.target.value.split(":") as [DeckSortKey | "saved", SortDirection];
                setDeckSort(sort === "saved" ? null : sort);
                setDeckSortDirection(direction);
              }} value={`${deckSort ?? "saved"}:${deckSortDirection}`}>
                <option value="saved:asc">登録順</option>
                <option value="cost:asc">コスト（昇順）</option>
                <option value="cost:desc">コスト（降順）</option>
                <option value="added:asc">追加順（昇順）</option>
                <option value="added:desc">追加順（降順）</option>
                <option value="name:asc">カード名（昇順）</option>
                <option value="name:desc">カード名（降順）</option>
                <option value="quantity:asc">枚数（昇順）</option>
                <option value="quantity:desc">枚数（降順）</option>
              </select>
              <button aria-label="デッキの昇順と降順を切り替える" onClick={() => {
                setDeckSort((current) => current ?? "cost");
                setDeckSortDirection((direction) => direction === "asc" ? "desc" : "asc");
              }} type="button">{deckSortDirection === "asc" ? "↑" : "↓"}</button>
            </div>
            <button aria-expanded={sortOpen} className="deck-preview-mobile-sort-button" onClick={() => { setSortOpen((open) => !open); setFilterOpen(false); }} type="button"><span aria-hidden="true">↕</span> 並べ替え</button>
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

        <div aria-label="デッキプレビューと右側領域の幅を変更" aria-orientation="vertical" aria-valuenow={Math.round(deckPanePercent)} className="deck-pane-splitter deck-pane-splitter-vertical" onKeyDown={(event) => handlePaneResizeKeyDown("deck", event)} onLostPointerCapture={() => { paneResizeRef.current = null; }} onPointerCancel={endPaneResize} onPointerDown={(event) => beginPaneResize("deck", event)} onPointerMove={movePaneResize} onPointerUp={endPaneResize} role="separator" tabIndex={0} />

        <aside className={`deck-maker-desktop-side${searchOverlap > 0 ? " is-search-overlay" : ""}`} ref={desktopSideRef}>
          <div className="deck-analysis-pane"><DeckAnalysis cards={cards} inline /></div>
          <div aria-label="分析グラフとカード検索の高さを変更" aria-orientation="horizontal" aria-valuenow={Math.round(analysisPanePercent)} className="deck-pane-splitter deck-pane-splitter-horizontal" onKeyDown={(event) => handlePaneResizeKeyDown("analysis", event)} onLostPointerCapture={() => { paneResizeRef.current = null; }} onPointerCancel={endPaneResize} onPointerDown={(event) => beginPaneResize("analysis", event)} onPointerMove={movePaneResize} onPointerUp={endPaneResize} ref={analysisSplitterRef} role="separator" tabIndex={0} />
          <section className="deck-search-shelf">
        <div aria-busy={currentSearchStatus === "searching"} className="deck-result-strip" aria-live="polite" onScroll={handleResultScroll} ref={resultStripRef}>
          {currentSearchStatus === "searching" ? <p role="status">{visibleResults.length > 0 && !resultsAreCurrent ? "検索中… 前の結果は操作できません" : "検索中…"}</p> : null}
          {currentSearchStatus === "error" ? <p role="alert">{searchError ?? "カード検索に失敗しました。もう一度お試しください。"}</p> : null}
          {currentSearchStatus === "empty" ? <p>条件に一致するカードがありません</p> : null}
          {currentSearchStatus !== "error" && visibleResults.map((card, index) => {
            const quantity = cards.find((item) => item.canonicalCardId === card.id)?.quantity ?? 0;
            const cannotAdd = total >= deckLimit || quantity >= MAX_COPIES_PER_CARD;
            return <article className="deck-result-card" key={card.id}>
              <div className="deck-result-card-media">
                <button aria-label={`${card.name}の詳細を開く`} className="deck-result-card-art" disabled={!resultsAreCurrent} onClick={() => void openCard(card)} title={`${card.name}の詳細を開く`} type="button">
                  <CardArtwork eager={index === 0} imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 760px) 84px, 180px" />
                  {quantity > 0 ? <strong className="deck-result-card-quantity">{quantity}</strong> : null}
                </button>
                <div className="deck-result-card-actions" aria-label={`${card.name}をデッキで増減`} role="group">
                  <button aria-label={`${card.name}を1枚減らす`} disabled={quantity === 0} onClick={() => removeCard(card.id)} type="button">−</button>
                  <span aria-label={`${quantity}枚`}>{quantity}</span>
                  <button aria-label={`${card.name}を1枚増やす`} disabled={!resultsAreCurrent || cannotAdd} onClick={() => addCard(card)} type="button">＋</button>
                </div>
              </div>
              <span className="deck-result-card-name" title={card.name}>{card.name}</span>
            </article>;
          })}
        </div>
        <div className="deck-search-bar" ref={searchBarRef}><div className="deck-search-input-row"><span aria-hidden="true">⌕</span>
          <input aria-label="カード名" placeholder="カード名で検索" value={query} onChange={cardSearchInput.onChange} onCompositionStart={cardSearchInput.onCompositionStart} onCompositionEnd={cardSearchInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, cardSearchInput.isComposing())) event.preventDefault(); }} />
        </div><div className="deck-search-controls-row">
          <div aria-label="文明で絞り込む" className="deck-search-civilizations deck-civilization-buttons">{[["", "すべて", "all"], ["fire", "火", "fire"], ["water", "水", "water"], ["nature", "自", "nature"], ["light", "光", "light"], ["darkness", "闇", "darkness"], ["zero", "無", "zero"]].map(([value, label, kind]) => <button aria-pressed={value ? civilizationFilter.includes(value) : civilizationFilter.length === 0} className={`deck-civilization-button ${kind}`} key={value || "all"} onClick={() => setCivilizationFilter((current) => value ? current.includes(value) ? current.filter((item) => item !== value) : [...current, value] : [])} type="button">{label}</button>)}</div>
          <div className="deck-search-actions"><select aria-label="検索結果の並び順" className="deck-search-sort-select" onChange={(event) => { const [sort, direction] = event.target.value.split(":") as [DeckSearchSortKey, SortDirection]; setSearchSort(sort); setSearchSortDirection(direction); }} value={`${searchSort}:${searchSortDirection}`}><option value="usage:desc">使用数順</option><option value="usage:asc">使用数順（昇順）</option><option value="relevance:asc">検索順</option><option value="name:asc">カード名順</option><option value="name:desc">カード名順（降順）</option><option value="release_date:desc">発売日順</option><option value="release_date:asc">発売日順（昇順）</option></select>
          <button aria-expanded={filterOpen} onClick={() => { setFilterOpen((open) => !open); setSortOpen(false); }} type="button"><span aria-hidden="true">☷</span> 絞り込み</button>
          <button className="deck-mobile-sort-button" aria-expanded={sortOpen} onClick={() => { setSortOpen((open) => !open); setFilterOpen(false); }} type="button"><span aria-hidden="true">↕</span> 並べ替え</button></div>
        </div>
        </div>
        {filterOpen && typeof document !== "undefined" ? createPortal(<>
        <section aria-label="カードの絞り込み" aria-modal="false" className="deck-filter-popover" ref={filterPopoverRef} role="dialog">
          <div className="deck-popover-heading"><strong>絞り込み</strong><button aria-label="絞り込みを閉じる" onClick={() => setFilterOpen(false)} type="button">×</button></div>
          {filterOptionsError ? <p role="alert">絞り込み候補を読み込めませんでした。</p> : null}
          <div className="deck-filter-field"><strong>文明</strong><div className="deck-filter-buttons deck-civilization-buttons">{[["fire", "火"], ["water", "水"], ["nature", "自"], ["light", "光"], ["darkness", "闇"], ["zero", "無"]].map(([value, label]) => <button aria-pressed={civilizationFilter.includes(value)} className={`deck-filter-civilization deck-civilization-button ${value}`} key={value} onClick={() => setCivilizationFilter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} type="button">{label}</button>)}</div></div>
          <div className="deck-filter-field"><strong>文明の条件</strong><div className="deck-filter-buttons"><button aria-pressed={civilizationMode === "cup"} onClick={() => setCivilizationMode("cup")} type="button">∪ いずれか</button><button aria-pressed={civilizationMode === "cap"} onClick={() => setCivilizationMode("cap")} type="button">∩ すべて</button></div></div>
          <div className="deck-filter-field deck-filter-color-filter"><strong>色数</strong><fieldset aria-label="色数" className="deck-filter-color-options">{[["all", "すべて"], ["single", "単色のみ"], ["multi", "多色のみ"]].map(([value, label]) => <label key={value}><input checked={colorFilter === value} name="color-filter" onChange={() => setColorFilter(value as typeof colorFilter)} type="radio" />{label}</label>)}</fieldset></div>
          <div className="deck-filter-field"><strong>コスト</strong><div className="deck-cost-range"><select aria-label="最小コスト" onChange={(event) => setMinimumCost(event.target.value)} value={minimumCost}><option value="">最小 未指定</option>{costOptions.map((cost) => <option key={cost} value={cost}>{cost}</option>)}</select><span>～</span><select aria-label="最大コスト" onChange={(event) => setMaximumCost(event.target.value)} value={maximumCost}><option value="">最大 未指定</option>{costOptions.map((cost) => <option key={cost} value={cost}>{cost}</option>)}</select></div></div>
          <label className="deck-filter-no-cost"><input checked={includeNoCost} onChange={(event) => setIncludeNoCost(event.target.checked)} type="checkbox" />コストなしを含める</label>
          <div className="deck-filter-field"><strong>パワー</strong><div className="deck-cost-range"><input aria-label="最小パワー" inputMode="numeric" onChange={(event) => setMinimumPower(event.target.value)} placeholder="最小 未指定" value={minimumPower} /><span>～</span><input aria-label="最大パワー" inputMode="numeric" onChange={(event) => setMaximumPower(event.target.value)} placeholder="最大 未指定" value={maximumPower} /></div></div>
          <div className="deck-filter-type-race">
            <div className="deck-filter-field"><strong>カードタイプ</strong><div className="deck-card-type-picker"><button aria-expanded={cardTypeListOpen} onClick={() => setCardTypeListOpen((open) => !open)} type="button">{cardTypeFilter || "指定なし"} <span aria-hidden="true" className="ui-icon ui-icon-dropdown" /></button>{cardTypeListOpen ? <div className="deck-card-type-options"><button onClick={() => { setCardTypeFilter(""); setCardTypeListOpen(false); }} type="button">指定なし</button>{cardTypeOptions.map((value) => <button aria-selected={cardTypeFilter === value} key={value} onClick={() => { setCardTypeFilter(value); setCardTypeListOpen(false); }} type="button">{value}</button>)}</div> : null}</div></div>
            <div className="deck-filter-field"><strong>種族</strong><button aria-expanded={racePickerOpen} className="deck-race-picker-trigger" onClick={() => { setRaceDraftTokens(selectedRaceTokens); setRaceSearch(""); setRacePickerOpen(true); }} type="button">{selectedRaceTokens.length ? selectedRaceTokens.join("・") : "種族を選択"}</button></div>
          </div>
          <label className="deck-filter-text-field">テキスト<input aria-label="カードテキスト" placeholder="テキストを入力" value={cardTextQuery} onChange={(event) => setCardTextQuery(event.target.value)} /></label>
          <div className="deck-filter-field"><strong>収録商品</strong><button aria-expanded={productListOpen} className="deck-race-picker-trigger" onClick={() => { setProductDraft(productFilter); productSearchInput.commitSelection(""); setProductListOpen(true); }} type="button">{productFilter || "すべて"}</button></div>
          <label>カード番号<input placeholder="例：DM24-RP1" value={cardNumberFilter} onChange={cardNumberSearchInput.onChange} onCompositionStart={cardNumberSearchInput.onCompositionStart} onCompositionEnd={cardNumberSearchInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, cardNumberSearchInput.isComposing())) event.preventDefault(); }} /></label>
          <button className="deck-filter-clear" onClick={() => { setProductFilter(""); productSearchInput.commitSelection(""); setProductListOpen(false); cardNumberSearchInput.setValue(""); setCivilizationFilter([]); setCivilizationMode("cup"); setColorFilter("all"); setCardTypeFilter(""); setCardTypeListOpen(false); setMinimumCost(""); setMaximumCost(""); setMinimumPower(""); setMaximumPower(""); setSelectedRaceTokens([]); setRaceDraftTokens([]); setRacePickerOpen(false); setRaceSearch(""); setCardTextQuery(""); setIncludeNoCost(false); }} type="button">全条件クリア</button>
        </section>
        {productListOpen ? <div className="deck-race-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProductListOpen(false); }} role="presentation">
          <section aria-label="収録商品の選択" aria-modal="true" className="deck-race-picker-modal deck-product-picker-modal" role="dialog">
            <div className="deck-race-picker-heading"><strong>収録商品の選択</strong><button aria-label="商品選択を閉じる" onClick={() => setProductListOpen(false)} type="button">×</button></div>
            <input aria-label="収録商品を検索" placeholder="商品名・商品コードで検索" ref={productSearchInput.inputRef} onFocus={productSearchInput.onFocus} onInput={productSearchInput.onInput} value={productQuery} onChange={productSearchInput.onChange} onCompositionStart={productSearchInput.onCompositionStart} onCompositionEnd={productSearchInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, productSearchInput.isComposing())) event.preventDefault(); }} />
            <div aria-label="収録商品一覧" className="deck-race-preset-list">
              {["", ...matchingProducts].map((name) => <button aria-pressed={productDraft === name} className="deck-race-preset" key={name} onPointerDown={(event) => { if (event.button !== 0) return; if (event.pointerType === "touch") { if (productSearchInput.isComposing()) { event.preventDefault(); productSearchInput.commitSelection(productQuery); } return; } event.preventDefault(); setProductDraft(name); productSearchInput.commitSelection(productQuery); }} onClick={() => { setProductDraft(name); productSearchInput.commitSelection(productQuery); }} type="button"><span aria-hidden="true" className="deck-race-preset-check">{productDraft === name ? "✓" : ""}</span><span className="deck-product-item-text"><span className="deck-product-name" title={name || "すべて"}>{name || "すべて"}</span>{productCodeByName[name]?.length ? <small className="deck-product-code" title={productCodeByName[name].join(" / ")}>{productCodeByName[name].join(" / ")}</small> : null}</span></button>)}
              {matchingProducts.length === 0 ? <p>該当する収録商品がありません</p> : null}
            </div>
            <div className="deck-race-picker-actions"><button onClick={() => setProductListOpen(false)} type="button">キャンセル</button><button onClick={() => { setProductFilter(productDraft); productSearchInput.commitSelection(""); setProductListOpen(false); }} type="button">決定</button></div>
          </section>
        </div> : null}
        {racePickerOpen ? <div className="deck-race-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRacePickerOpen(false); }} role="presentation">
          <section aria-label="種族の選択" aria-modal="true" className="deck-race-picker-modal" role="dialog">
            <div className="deck-race-picker-heading"><strong>種族の選択</strong><button aria-label="種族選択を閉じる" onClick={() => setRacePickerOpen(false)} type="button">×</button></div>
            <input aria-label="種族を検索" onChange={(event) => setRaceSearch(event.target.value)} placeholder="種族を検索" value={raceSearch} />
            <div aria-label="よく使う種族語" className="deck-race-quick-buttons">{QUICK_RACE_TOKENS.map((token) => <button aria-pressed={raceDraftTokens.includes(token)} key={token} onClick={() => setRaceDraftTokens((current) => current.includes(token) ? current.filter((item) => item !== token) : [...current, token])} type="button">{token}</button>)}</div>
            <p className="deck-race-picker-hint">選択した語をすべて含む種族が対象になります。現在の検索語: {raceDraftTokens.length ? raceDraftTokens.join("・") : "なし"}</p>
            <div aria-label="種族一覧" className="deck-race-preset-list">{allRaces.filter((race) => getRaceTokens(raceSearch).every((term) => race.toLocaleLowerCase().includes(term.toLocaleLowerCase()))).map((race) => {
              const tokens = getRaceTokens(race);
              const selected = tokens.every((token) => raceDraftTokens.includes(token));
              return <button aria-pressed={selected} className="deck-race-preset" key={race} onClick={() => setRaceDraftTokens((current) => selected ? current.filter((token) => !tokens.includes(token)) : Array.from(new Set([...current, ...tokens])))} type="button"><span aria-hidden="true" className="deck-race-preset-check">{selected ? "✓" : ""}</span>{race}</button>;
            })}</div>
            <div className="deck-race-picker-actions"><button onClick={() => setRacePickerOpen(false)} type="button">キャンセル</button><button onClick={() => { setSelectedRaceTokens(raceDraftTokens); setRacePickerOpen(false); }} type="button">決定</button></div>
          </section>
        </div> : null}
        </>, document.body) : null}
        {sortOpen ? <section className="deck-sort-modal-backdrop" onClick={() => setSortOpen(false)} role="presentation"><div aria-label="並べ替え方法選択" aria-modal="true" className="deck-sort-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="deck-popover-heading"><strong>並べ替え方法選択</strong><button aria-label="並べ替えを閉じる" onClick={() => setSortOpen(false)} type="button">×</button></div>
          <div className="deck-sort-section-heading"><h3>デッキ並べ替え</h3><button aria-label="デッキの昇順と降順を切り替える" className="deck-sort-direction" onClick={() => { setDeckSort((current) => current ?? "cost"); setDeckSortDirection((direction) => direction === "asc" ? "desc" : "asc"); }} type="button">{deckSortDirection === "asc" ? "↑ 昇順" : "↓ 降順"}</button></div><div className="deck-sort-options"><button className={deckSort === "cost" ? "active" : ""} onClick={() => setDeckSort("cost")} type="button">コスト順</button><button className={deckSort === "added" ? "active" : ""} onClick={() => setDeckSort("added")} type="button">追加順</button><button className={deckSort === "name" ? "active" : ""} onClick={() => setDeckSort("name")} type="button">カード名順</button><button className={deckSort === "quantity" ? "active" : ""} onClick={() => setDeckSort("quantity")} type="button">枚数順</button></div>
          <div className="deck-sort-section-heading"><h3>検索結果並べ替え</h3><button aria-label="検索結果の昇順と降順を切り替える" className="deck-sort-direction" onClick={() => setSearchSortDirection((direction) => direction === "asc" ? "desc" : "asc")} type="button">{searchSortDirection === "asc" ? "↑ 昇順" : "↓ 降順"}</button></div><div className="deck-sort-options search"><button className={searchSort === "relevance" ? "active" : ""} onClick={() => { setSearchSort("relevance"); setSearchSortDirection("asc"); }} type="button">検索順</button><button className={searchSort === "name" ? "active" : ""} onClick={() => setSearchSort("name")} type="button">カード名順</button><button className={searchSort === "release_date" ? "active" : ""} onClick={() => { setSearchSort("release_date"); setSearchSortDirection("desc"); }} type="button">発売日順</button><button className={searchSort === "usage" ? "active" : ""} onClick={() => { setSearchSort("usage"); setSearchSortDirection("desc"); }} type="button">使用数順</button></div>
        </div></section> : null}
          </section>
        </aside>
      </div>

      {selectedCard && typeof document !== "undefined" ? createPortal(<div className="deck-card-modal-backdrop" onClick={closeCard} role="presentation">
        <section aria-label={`${selectedCard.name}のカード詳細`} aria-modal="true" className="deck-card-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="deck-card-modal-main">
            <CardArtwork className="deck-card-modal-art" eager imageUrl={selectedImageUrl} name={selectedCard.name} sizes="(max-width: 600px) 88vw, 430px" />
          </div>
          <div className="deck-card-variants-row">
            <div className="deck-card-variants" aria-label="別イラスト一覧">
              {selectedCardDetailsLoading ? <p role="status">イラストを読み込み中…</p> : selectedCard.imageOptions.length > 0 ? selectedCard.imageOptions.map((option, index) => <button aria-label={`イラスト${index + 1}を選択`} aria-pressed={selectedImageUrl === option.url} key={option.printId} onClick={() => selectIllustration(option)} type="button">
                <CardArtwork eager imageUrl={option.url} name={`${selectedCard.name} イラスト${index + 1}`} sizes="90px" />
              </button>) : <p>別イラスト画像はまだ登録されていません。</p>}
            </div>
            <button className="deck-card-modal-close deck-card-modal-close-variants" onClick={closeCard} type="button"><span aria-hidden="true">×</span>閉じる</button>
          </div>
          <div className="deck-card-modal-controls">
            <button className="deck-card-modal-unify" disabled={!cards.some((item) => item.canonicalCardId === selectedCard.id) || !selectedImageUrl} onClick={unifyIllustration} type="button"><span aria-hidden="true">▣</span>イラストを統一</button>
            <button className="deck-card-modal-add-four" disabled={total >= deckLimit || (cards.find((item) => item.canonicalCardId === selectedCard.id)?.quantity ?? 0) >= MAX_COPIES_PER_CARD || !selectedImageUrl} onClick={() => addCard(selectedCard, selectedImageUrl, 4)} type="button"><span aria-hidden="true">＋</span>カードを4枚追加</button>
            <div><small>デッキ内</small><span>
              <button aria-label="1枚減らす" disabled={!cards.some((item) => item.canonicalCardId === selectedCard.id)} onClick={() => removeCard(selectedCard.id)} type="button">−</button>
              <strong>{cards.find((item) => item.canonicalCardId === selectedCard.id)?.quantity ?? 0}<small>/4枚</small></strong>
              <button aria-label="1枚増やす" disabled={total >= deckLimit || (cards.find((item) => item.canonicalCardId === selectedCard.id)?.quantity ?? 0) >= MAX_COPIES_PER_CARD} onClick={() => addCard(selectedCard, selectedImageUrl)} type="button">＋</button>
            </span></div>
            <button className="deck-card-modal-close" onClick={closeCard} type="button"><span aria-hidden="true">×</span>閉じる</button>
          </div>
        </section>
      </div>, document.body) : null}

      <input name="editorSortKey" type="hidden" value={deckSort ?? "saved"} />
      <input name="editorSortDirection" type="hidden" value={deckSortDirection} />
      <input name="cards" type="hidden" value={JSON.stringify(orderedCards)} />
      {state.status === "error" ? <p className="notice error deck-maker-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
