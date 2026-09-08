"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createDeckAction, updateDeckAction } from "@/app/decks/actions";
import { initialDeckActionState } from "@/app/decks/action-state";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { sortDeckCards, sortSearchCards, type DeckSortKey, type SearchSortKey, type SortDirection } from "@/lib/deck-sorting";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { CARD_SEARCH_DEBOUNCE_MS } from "@/lib/search-timing";

type ImageOption = { printId: number; url: string };
type SearchCard = { id: number; name: string; name_kana: string | null; print_count: number; usage_count?: number; cost?: number | null; imageUrl: string | null; imageOptions: ImageOption[]; productNames: string[]; cardNumbers: string[]; newestPrintId: number };
type SelectedCard = { canonicalCardId: number; cardPrintId: number | null; name: string; quantity: number; imageUrl: string | null; cost?: number | null };
type DeckTab = "main" | "gr" | "special";
export type DeckEditorInitialData = { id: string; name: string; format: "original" | "advanced" | "duel_party"; visibility: "private" | "unlisted" | "public"; description: string; cards: SelectedCard[] };

export function DeckEditor({ initialDeck, fallbackCosts = {} }: { initialDeck?: DeckEditorInitialData; fallbackCosts?: Record<string, number> }) {
  const submitAction = useMemo(() => initialDeck ? updateDeckAction.bind(null, initialDeck.id) : createDeckAction, [initialDeck]);
  const [state, formAction, pending] = useActionState(submitAction, initialDeckActionState);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [cards, setCards] = useState<SelectedCard[]>(initialDeck?.cards ?? []);
  const [format, setFormat] = useState<DeckEditorInitialData["format"]>(initialDeck?.format ?? "original");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DeckTab>("main");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SearchCard | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [cardNumberFilter, setCardNumberFilter] = useState("");
  const [imageFilter, setImageFilter] = useState<"all" | "with" | "without">("all");
  const [searchSort, setSearchSort] = useState<SearchSortKey>("usage");
  const [searchSortDirection, setSearchSortDirection] = useState<SortDirection>("desc");
  const [deckSort, setDeckSort] = useState<DeckSortKey>("cost");
  const [deckSortDirection, setDeckSortDirection] = useState<SortDirection>("asc");
  const total = useMemo(() => cards.reduce((sum, card) => sum + card.quantity, 0), [cards]);
  const deckLimit = format === "duel_party" ? 60 : 40;
  const expandedCards = useMemo(() => {
    const ordered = sortDeckCards(cards, deckSort, deckSortDirection);
    return ordered.flatMap((card) => Array.from({ length: card.quantity }, (_, copyIndex) => ({ ...card, copyIndex })));
  }, [cards, deckSort, deckSortDirection]);
  const productOptions = useMemo(() => Array.from(new Set(results.flatMap((card) => card.productNames))).sort((a, b) => a.localeCompare(b, "ja")), [results]);
  const visibleResults = useMemo(() => {
    const filtered = results.filter((card) => (!productFilter || card.productNames.includes(productFilter))
      && (!cardNumberFilter.trim() || card.cardNumbers.some((number) => number.toLowerCase().includes(cardNumberFilter.trim().toLowerCase())))
      && (imageFilter === "all" || (imageFilter === "with" ? card.imageOptions.length > 0 : card.imageOptions.length === 0)));
    return query.trim() ? sortSearchCards(filtered, searchSort, searchSortDirection) : filtered;
  }, [results, productFilter, cardNumberFilter, imageFilter, searchSort, searchSortDirection, query]);

  useEffect(() => {
    let cancelled = false;
    const value = query.trim();
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) return setSearching(false);
      const { data, error } = !value || searchSort === "usage"
        ? await supabase.rpc("search_deck_cards_by_usage", {
          p_query: value, p_limit: 30, p_ascending: Boolean(value) && searchSortDirection === "asc",
        })
        : await supabase.rpc("search_canonical_cards", {
          p_query: value, p_game_slug: "duel-masters", p_limit: 30, p_mode: "broad",
        });
      if (cancelled) return;
      if (error) { setResults([]); setSearching(false); setSearchError("カード検索に失敗しました。もう一度お試しください。"); return; }
      const ids = (data ?? []).map((row) => row.id);
      const [{ data: prints }, { data: metadata }] = ids.length === 0
        ? [{ data: [] }, { data: [] }]
        : await Promise.all([
          supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", ids).not("image_key", "is", null).order("id"),
          supabase.from("canonical_cards").select("id, cost").in("id", ids),
        ]);
      const imageOptions = new Map<number, ImageOption[]>();
      const products = new Map<number, Set<string>>();
      const cardNumbers = new Map<number, Set<string>>();
      const newestPrintIds = new Map<number, number>();
      const costs = new Map((metadata ?? []).map((card) => [card.id, card.cost]));
      for (const print of sortCardPrintsOldestFirst(prints ?? [])) {
        newestPrintIds.set(print.canonical_card_id, Math.max(newestPrintIds.get(print.canonical_card_id) ?? 0, print.id));
        if (print.product_name) products.set(print.canonical_card_id, (products.get(print.canonical_card_id) ?? new Set()).add(print.product_name));
        if (print.card_number) cardNumbers.set(print.canonical_card_id, (cardNumbers.get(print.canonical_card_id) ?? new Set()).add(print.card_number));
        if (print.image_key) {
          const options = imageOptions.get(print.canonical_card_id) ?? [];
          const url = getCardImageUrl(print.image_key);
          if (url && !options.some((option) => option.url === url)) imageOptions.set(print.canonical_card_id, [...options, { printId: print.id, url }]);
        }
      }
      if (!cancelled) {
        setResults((data ?? []).filter((row) => Number.isSafeInteger(row.id) && typeof row.name === "string").map((row) => {
          const options = imageOptions.get(row.id) ?? [];
          return { id: row.id, name: row.name, name_kana: row.name_kana || null, print_count: row.print_count, usage_count: "usage_count" in row ? row.usage_count : 0, cost: costs.get(row.id) ?? fallbackCosts[row.name],
            imageUrl: options[0]?.url ?? null, imageOptions: options,
            productNames: Array.from(products.get(row.id) ?? []), cardNumbers: Array.from(cardNumbers.get(row.id) ?? []), newestPrintId: newestPrintIds.get(row.id) ?? 0 };
        }));
        setSearching(false);
      }
    }, CARD_SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, fallbackCosts, searchSort, searchSortDirection]);

  function addCard(card: SearchCard, imageUrl = card.imageUrl) {
    const cardPrintId = card.imageOptions.find((option) => option.url === imageUrl)?.printId ?? null;
    setCards((current) => {
      const currentTotal = current.reduce((sum, item) => sum + item.quantity, 0);
      const existing = current.find((item) => item.canonicalCardId === card.id);
      if (currentTotal >= deckLimit || (existing?.quantity ?? 0) >= 4) return current;
      if (existing) return current.map((item) => item.canonicalCardId === card.id ? { ...item, cardPrintId, imageUrl, quantity: item.quantity + 1 } : item);
      return [...current, { canonicalCardId: card.id, cardPrintId, name: card.name, quantity: 1, imageUrl, cost: card.cost }];
    });
  }

  function removeCard(id: number) {
    setCards((current) => current.flatMap((card) => card.canonicalCardId !== id
      ? [card] : card.quantity <= 1 ? [] : [{ ...card, quantity: card.quantity - 1 }]));
  }

  function clearDeck() {
    if (cards.length === 0 || window.confirm("メインデッキのカードをすべて外しますか？")) setCards([]);
  }

  function openCard(card: SearchCard) {
    setSelectedCard(card);
    setSelectedImageUrl(cards.find((item) => item.canonicalCardId === card.id)?.imageUrl ?? card.imageUrl);
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
      cardNumbers: [...new Set(orderedPrints.flatMap((print) => print.card_number ? [print.card_number] : []))],
      newestPrintId: Math.max(0, ...(prints ?? []).map((print) => print.id)),
      cost: card.cost,
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
    <form action={formAction} className="deck-maker-form">
      <header className="deck-maker-toolbar">
        <label className="deck-maker-name">デッキ名<input defaultValue={initialDeck?.name} maxLength={60} name="name" placeholder="デッキ名を入力" required /></label>
        <div className="deck-maker-actions">
          <button onClick={() => setSettingsOpen((open) => !open)} type="button"><span aria-hidden="true">⚙</span> 設定</button>
          <button onClick={clearDeck} type="button"><span aria-hidden="true" className="ui-icon ui-icon-trash" /> 全解除</button>
          <button className="deck-save-button" disabled={pending} type="submit"><span aria-hidden="true">▣</span> {pending ? "保存中" : "保存"}</button>
        </div>
      </header>

      <section className="deck-maker-settings" hidden={!settingsOpen}>
        <label>フォーマット<select name="format" onChange={(event) => setFormat(event.target.value as DeckEditorInitialData["format"])} value={format}><option value="original">オリジナル</option><option value="advanced">アドバンス</option><option value="duel_party">デュエパーティ</option></select></label>
        <label>公開範囲<select name="visibility" defaultValue={initialDeck?.visibility ?? "private"}><option value="private">非公開</option><option value="unlisted">URL限定</option><option value="public">公開</option></select></label>
        <label className="deck-description-field">説明<textarea defaultValue={initialDeck?.description} maxLength={1000} name="description" placeholder="デッキのメモ（任意）" rows={2} /></label>
      </section>

      <nav aria-label="デッキのカード種別" className="deck-maker-tabs">
        <button aria-selected={activeTab === "main"} onClick={() => setActiveTab("main")} role="tab" type="button">メイン <strong>{total}</strong></button>
        <button aria-selected={activeTab === "gr"} onClick={() => setActiveTab("gr")} role="tab" type="button">GR / 超次元 <strong>0</strong></button>
        <button aria-selected={activeTab === "special"} onClick={() => setActiveTab("special")} role="tab" type="button">特殊</button>
      </nav>

      <section className="deck-maker-canvas">
        {activeTab === "main" ? <>
          <div className="deck-maker-count"><strong className={total === deckLimit ? "complete" : total > deckLimit ? "over" : ""}>{total}<small>/{deckLimit}</small></strong></div>
          {expandedCards.length === 0 ? <div className="deck-maker-empty"><strong>カードがまだありません</strong><span>下の検索欄からカードを追加してください</span></div> :
            <div className="deck-maker-grid">{expandedCards.map((card) => (
              <button aria-label={`${card.name}の詳細を開く`} className="deck-maker-card" key={`${card.canonicalCardId}-${card.copyIndex}`} onClick={() => openDeckCard(card)} title={`${card.name}の詳細を開く`} type="button">
                <CardArtwork eager imageUrl={card.imageUrl} name={card.name} sizes="(max-width: 600px) 20vw, 120px" />
              </button>
            ))}</div>}
        </> : <div className="deck-maker-empty"><strong>{activeTab === "gr" ? "GR / 超次元ゾーン" : "特殊ゾーン"}</strong><span>このゾーンのカード登録は次の実装で対応します</span></div>}
      </section>

      <section className="deck-search-shelf">
        <div className="deck-result-strip" aria-live="polite">
          {searching ? <p>検索中…</p> : searchError ? <p role="alert">{searchError}</p> : visibleResults.length === 0 ? <p>条件に一致するカードがありません</p> : visibleResults.map((card) => {
            const quantity = cards.find((item) => item.canonicalCardId === card.id)?.quantity ?? 0;
            return <button key={card.id} onClick={() => openCard(card)} title={`${card.name}の詳細を開く`} type="button">
              <CardArtwork eager imageUrl={card.imageUrl} name={card.name} sizes="110px" />
              {quantity > 0 ? <strong>{quantity}</strong> : null}<span>{card.name}</span>
            </button>;
          })}
        </div>
        <div className="deck-search-bar"><span aria-hidden="true">⌕</span>
          <input aria-label="カード名" placeholder="カード名で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button aria-expanded={filterOpen} onClick={() => { setFilterOpen((open) => !open); setSortOpen(false); }} type="button"><span aria-hidden="true">☷</span> 絞り込み</button>
          <button aria-expanded={sortOpen} onClick={() => { setSortOpen((open) => !open); setFilterOpen(false); }} type="button"><span aria-hidden="true">↕</span> 並べ替え</button>
        </div>
        {filterOpen ? <section className="deck-filter-popover" aria-label="カードの絞り込み">
          <div className="deck-popover-heading"><strong>絞り込み</strong><button aria-label="絞り込みを閉じる" onClick={() => setFilterOpen(false)} type="button">×</button></div>
          <label>収録商品<select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="">すべて</option>{productOptions.map((product) => <option key={product} value={product}>{product}</option>)}</select></label>
          <label>カード番号<input placeholder="例：DM24-RP1" value={cardNumberFilter} onChange={(event) => setCardNumberFilter(event.target.value)} /></label>
          <fieldset><legend>画像</legend><label><input checked={imageFilter === "all"} name="image-filter" onChange={() => setImageFilter("all")} type="radio" />すべて</label><label><input checked={imageFilter === "with"} name="image-filter" onChange={() => setImageFilter("with")} type="radio" />画像あり</label><label><input checked={imageFilter === "without"} name="image-filter" onChange={() => setImageFilter("without")} type="radio" />画像なし</label></fieldset>
          <button className="deck-filter-clear" onClick={() => { setProductFilter(""); setCardNumberFilter(""); setImageFilter("all"); }} type="button">全条件クリア</button>
        </section> : null}
        {sortOpen ? <section className="deck-sort-modal-backdrop" onClick={() => setSortOpen(false)} role="presentation"><div aria-label="並べ替え方法選択" aria-modal="true" className="deck-sort-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="deck-popover-heading"><strong>並べ替え方法選択</strong><button aria-label="並べ替えを閉じる" onClick={() => setSortOpen(false)} type="button">×</button></div>
          <div className="deck-sort-section-heading"><h3>デッキ並べ替え</h3><button aria-label="デッキの昇順と降順を切り替える" className="deck-sort-direction" onClick={() => setDeckSortDirection((direction) => direction === "asc" ? "desc" : "asc")} type="button">{deckSortDirection === "asc" ? "↑ 昇順" : "↓ 降順"}</button></div><div className="deck-sort-options"><button className={deckSort === "cost" ? "active" : ""} onClick={() => setDeckSort("cost")} type="button">コスト順</button><button className={deckSort === "added" ? "active" : ""} onClick={() => setDeckSort("added")} type="button">追加順</button><button className={deckSort === "name" ? "active" : ""} onClick={() => setDeckSort("name")} type="button">カード名順</button><button className={deckSort === "quantity" ? "active" : ""} onClick={() => setDeckSort("quantity")} type="button">枚数順</button></div>
          <div className="deck-sort-section-heading"><h3>検索結果並べ替え</h3><button aria-label="検索結果の昇順と降順を切り替える" className="deck-sort-direction" onClick={() => setSearchSortDirection((direction) => direction === "asc" ? "desc" : "asc")} type="button">{searchSortDirection === "asc" ? "↑ 昇順" : "↓ 降順"}</button></div><div className="deck-sort-options search"><button className={searchSort === "relevance" ? "active" : ""} onClick={() => setSearchSort("relevance")} type="button">検索順</button><button className={searchSort === "name" ? "active" : ""} onClick={() => setSearchSort("name")} type="button">カード名順</button><button className={searchSort === "prints" ? "active" : ""} onClick={() => setSearchSort("prints")} type="button">収録数順</button><button className={searchSort === "usage" ? "active" : ""} onClick={() => { setSearchSort("usage"); setSearchSortDirection("desc"); }} type="button">使用数順</button></div>
        </div></section> : null}
      </section>

      {selectedCard ? <div className="deck-card-modal-backdrop" onClick={() => setSelectedCard(null)} role="presentation">
        <section aria-label={`${selectedCard.name}のカード詳細`} aria-modal="true" className="deck-card-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="deck-card-modal-main">
            <CardArtwork className="deck-card-modal-art" eager imageUrl={selectedImageUrl} name={selectedCard.name} sizes="(max-width: 600px) 88vw, 430px" />
          </div>
          <div className="deck-card-variants" aria-label="別イラスト一覧">
            {selectedCard.imageOptions.length > 0 ? selectedCard.imageOptions.map((option, index) => <button aria-label={`イラスト${index + 1}を選択`} aria-pressed={selectedImageUrl === option.url} key={option.printId} onClick={() => selectIllustration(option)} type="button">
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
            <button className="deck-card-modal-close" onClick={() => setSelectedCard(null)} type="button"><span aria-hidden="true">×</span>閉じる</button>
          </div>
        </section>
      </div> : null}

      <input name="cards" type="hidden" value={JSON.stringify(cards)} />
      {state.status === "error" ? <p className="notice error deck-maker-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
