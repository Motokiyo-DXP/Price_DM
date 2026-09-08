"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CardArtwork } from "@/components/card-artwork";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildShoppingListGroups, type ShoppingCard, type ShoppingListEntry, type ShoppingPriceKind, type ShoppingPriceRecord } from "@/lib/shopping-list";

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
const artworkSizes = "(max-width: 620px) 70px, 88px";

function PricedShoppingCard({ entry, kind, onRemove }: { entry: ShoppingListEntry; kind: ShoppingPriceKind; onRemove: (id: number) => void }) {
  return (
    <article className="shopping-card shopping-card-priced">
      <Link aria-label={`${entry.name}の詳細を開く`} className="shopping-card-detail-link" href={`/cards/${entry.id}`} />
      <CardArtwork imageUrl={entry.imageUrl} name={entry.name} sizes={artworkSizes} />
      <div className="shopping-card-copy">
        <h3>{entry.name}</h3>
        <p className={entry.rank === 1 ? "shopping-rank best" : "shopping-rank second"}>
          {kind === "sale" ? (entry.rank === 1 ? "最安値" : "次点") : (entry.rank === 1 ? "最高買取" : "次点")}
        </p>
        <strong>{yen(entry.price)}</strong>
        <dl>
          <div><dt>最安値</dt><dd>{yen(entry.minimumPrice)}</dd></div>
          <div><dt>平均価格</dt><dd>{yen(entry.averagePrice)}</dd></div>
        </dl>
      </div>
      <button aria-label={`${entry.name}を買い物リストから削除`} className="shopping-remove-bookmark" onClick={() => onRemove(entry.id)} type="button"><span aria-hidden="true" className="ui-icon ui-icon-trash" /></button>
    </article>
  );
}

function UnpricedShoppingCard({ card }: { card: ShoppingCard }) {
  return (
    <Link aria-label={`${card.name}の詳細を開く`} className="shopping-card" href={`/cards/${card.id}`}>
      <CardArtwork imageUrl={card.imageUrl} name={card.name} sizes={artworkSizes} />
      <div className="shopping-card-copy">
        <h3>{card.name}</h3>
        <p>価格データがありません</p>
      </div>
    </Link>
  );
}

export function ShoppingListView({ cards, records }: { cards: ShoppingCard[]; records: ShoppingPriceRecord[] }) {
  const [kind, setKind] = useState<ShoppingPriceKind>("sale");
  const [showSecondChoices, setShowSecondChoices] = useState(false);
  const [removedCardIds, setRemovedCardIds] = useState<number[]>([]);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const visibleCards = useMemo(() => cards.filter((card) => !removedCardIds.includes(card.id)), [cards, removedCardIds]);
  const visibleRecords = useMemo(() => records.filter((record) => !removedCardIds.includes(record.canonicalCardId)), [records, removedCardIds]);
  const groups = useMemo(() => buildShoppingListGroups(visibleCards, visibleRecords, kind), [kind, visibleCards, visibleRecords]);
  const pricedCardIds = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.id)));
  const cardsWithoutPrices = visibleCards.filter((card) => !pricedCardIds.has(card.id));

  const removeBookmark = async (id: number) => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setRemoveError("買い物リストを更新できませんでした。");
      return;
    }
    setRemoveError(null);
    setRemovedCardIds((current) => current.includes(id) ? current : [...current, id]);
    const { error } = await supabase.from("account_card_bookmarks").delete().eq("canonical_card_id", id);
    if (error) {
      setRemovedCardIds((current) => current.filter((cardId) => cardId !== id));
      setRemoveError("ブックマークを解除できませんでした。再度お試しください。");
    }
  };

  return (
    <div className="shopping-list-page">
      <div className="shopping-list-heading">
        <div>
          <p className="eyebrow">MY BOOKMARKS</p>
          <h1>買い物リスト</h1>
        </div>
        <div className="shopping-list-controls">
          <div className="shopping-kind-toggle" role="group" aria-label="価格の種類">
            <button aria-pressed={kind === "sale"} className={kind === "sale" ? "active" : ""} onClick={() => setKind("sale")} type="button">販売</button>
            <button aria-pressed={kind === "buy"} className={kind === "buy" ? "active" : ""} onClick={() => setKind("buy")} type="button">買取</button>
          </div>
          <button
            aria-pressed={showSecondChoices}
            className="shopping-second-toggle"
            onClick={() => setShowSecondChoices((current) => !current)}
            type="button"
          >
            次点を{showSecondChoices ? "非表示" : "表示"}
          </button>
        </div>
      </div>

      {removeError ? <p className="notice error" role="alert">{removeError}</p> : null}

      {!visibleCards.length ? <section className="shopping-list-empty"><p>ブックマークしたカードはありません。</p><Link className="button" href="/">カードを探す</Link></section> : null}

      {groups.map((group) => (
        <section className="shopping-store" key={group.shopId}>
          <h2>{group.shopName}</h2>
          <div className="shopping-store-cards">
            {group.entries
              .filter((entry) => showSecondChoices || entry.rank === 1)
              .map((entry) => <PricedShoppingCard entry={entry} key={`${group.shopId}-${entry.id}`} kind={kind} onRemove={(id) => void removeBookmark(id)} />)}
          </div>
        </section>
      ))}

      {cardsWithoutPrices.length ? (
        <section className="shopping-store shopping-unpriced">
          <h2>{kind === "sale" ? "販売価格未登録" : "買取価格未登録"}</h2>
          <div className="shopping-store-cards">
            {cardsWithoutPrices.map((card) => <UnpricedShoppingCard card={card} key={card.id} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
