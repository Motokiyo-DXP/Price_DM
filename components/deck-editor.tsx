"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createDeckAction } from "@/app/decks/actions";
import { initialDeckActionState } from "@/app/decks/action-state";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type SearchCard = { id: number; name: string; name_kana: string | null; print_count: number; imageUrl: string | null };
type SelectedCard = { canonicalCardId: number; name: string; quantity: number; imageUrl: string | null };

export function DeckEditor() {
  const [state, formAction, pending] = useActionState(createDeckAction, initialDeckActionState);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [cards, setCards] = useState<SelectedCard[]>([]);
  const [searching, setSearching] = useState(false);
  const total = useMemo(() => cards.reduce((sum, card) => sum + card.quantity, 0), [cards]);

  useEffect(() => {
    let cancelled = false;
    const value = query.trim();
    if (!value) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setSearching(false);
        return;
      }
      const { data } = await supabase.rpc("search_canonical_cards", {
        p_query: value,
        p_game_slug: "duel-masters",
        p_limit: 30,
        p_mode: "broad",
      });
      const ids = (data ?? []).map((row) => row.id);
      const { data: prints } = ids.length === 0 ? { data: [] } : await supabase
        .from("card_prints")
        .select("id, canonical_card_id, image_key")
        .in("canonical_card_id", ids)
        .not("image_key", "is", null)
        .order("id");
      const imageKeys = new Map<number, string>();
      for (const print of prints ?? []) {
        if (print.image_key && !imageKeys.has(print.canonical_card_id)) imageKeys.set(print.canonical_card_id, print.image_key);
      }
      if (!cancelled) {
        setResults((data ?? [])
          .filter((row) => Number.isSafeInteger(row.id) && typeof row.name === "string")
          .map((row) => ({
            id: row.id,
            name: row.name,
            name_kana: row.name_kana || null,
            print_count: row.print_count,
            imageUrl: getCardImageUrl(imageKeys.get(row.id)),
          })));
        setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function addCard(card: SearchCard) {
    setCards((current) => {
      const existing = current.find((item) => item.canonicalCardId === card.id);
      if (existing) {
        if (existing.quantity >= 4 || total >= 40) return current;
        return current.map((item) => item.canonicalCardId === card.id
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      if (total >= 40) return current;
      return [...current, { canonicalCardId: card.id, name: card.name, quantity: 1, imageUrl: card.imageUrl }];
    });
  }

  function changeQuantity(id: number, delta: number) {
    setCards((current) => current.flatMap((card) => {
      if (card.canonicalCardId !== id) return [card];
      const quantity = card.quantity + delta;
      if (quantity <= 0) return [];
      if (quantity > 4 || (delta > 0 && total >= 40)) return [card];
      return [{ ...card, quantity }];
    }));
  }

  return (
    <form action={formAction} className="deck-editor-form">
      <div className="deck-settings">
        <label>デッキ名<input maxLength={60} name="name" required /></label>
        <div className="two">
          <label>フォーマット<select name="format" defaultValue="original"><option value="original">オリジナル</option><option value="advanced">アドバンス</option></select></label>
          <label>公開範囲<select name="visibility" defaultValue="private"><option value="private">非公開</option><option value="unlisted">URL限定</option><option value="public">公開</option></select></label>
        </div>
        <label>説明<textarea maxLength={1000} name="description" rows={3} /></label>
      </div>

      <section className="deck-builder">
        <div className="deck-search-panel">
          <h2>カードを検索</h2>
          <input aria-label="カード名" placeholder="カード名を入力" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="deck-search-results" aria-live="polite">
            {searching ? <p>検索中…</p> : results.map((card) => (
              <button key={card.id} onClick={() => addCard(card)} type="button">
                <CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="64px" />
                <span><strong>{card.name}</strong><small>{card.name_kana ?? "読み未登録"}・収録{card.print_count}件</small></span>
                <span aria-hidden="true">＋</span>
              </button>
            ))}
          </div>
        </div>

        <div className="deck-card-panel">
          <div className="deck-count"><h2>メインデッキ</h2><strong className={total === 40 ? "complete" : ""}>{total} / 40</strong></div>
          {cards.length === 0 ? <p className="empty">検索結果からカードを追加してください。</p> : (
            <ol className="deck-card-list">
              {cards.map((card) => (
                <li key={card.canonicalCardId}>
                  <CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="48px" />
                  <span>{card.name}</span>
                  <div><button type="button" onClick={() => changeQuantity(card.canonicalCardId, -1)}>−</button><strong>{card.quantity}</strong><button type="button" onClick={() => changeQuantity(card.canonicalCardId, 1)}>＋</button></div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
      <input name="cards" type="hidden" value={JSON.stringify(cards)} />
      {state.status === "error" ? <p className="notice error" role="alert">{state.message}</p> : null}
      <button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "デッキを保存"}</button>
      <p className="form-intro">40枚未満でも下書きとして保存できます。</p>
    </form>
  );
}
