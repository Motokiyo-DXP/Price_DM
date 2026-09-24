"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { updateShopSearchMetadataAction } from "@/app/admin/actions";
import { initialShopRegistrationActionState } from "@/app/admin/action-state";
import type { AdminShopSearchMetadata } from "@/lib/admin-shop-search-metadata";
import { normalizeShopSearch } from "@/lib/search-normalization";
import { isImeCompositionEnter, useImeRealtimeInput } from "@/lib/use-ime-realtime-input";

export function AdminShopSearchMetadataForm({ shops }: { shops: AdminShopSearchMetadata[] }) {
  const [shopId, setShopId] = useState(shops[0]?.id ?? 0);
  const shopFilterInput = useImeRealtimeInput();
  const filter = shopFilterInput.value;
  const filteredShops = useMemo(() => {
    const normalizedFilter = normalizeShopSearch(filter);
    if (!normalizedFilter) return shops;

    return shops.filter((shop) =>
      normalizeShopSearch([shop.name, shop.nameKana, ...shop.aliases].filter(Boolean).join(" ")).includes(
        normalizedFilter,
      ),
    );
  }, [filter, shops]);
  const selectedShop = useMemo(
    () => filteredShops.find((shop) => shop.id === shopId) ?? filteredShops[0] ?? null,
    [filteredShops, shopId],
  );
  useEffect(() => {
    if (selectedShop && selectedShop.id !== shopId) setShopId(selectedShop.id);
  }, [selectedShop, shopId]);
  const [state, formAction, pending] = useActionState(updateShopSearchMetadataAction, initialShopRegistrationActionState);
  if (!selectedShop) {
    return (
      <p className="history-empty">
        {filter ? "一致する店舗がありません。絞り込み条件を変えてください。" : "編集できる店舗がありません。"}
      </p>
    );
  }
  return (
    <section className="admin-registration-panel" aria-labelledby="admin-shop-search-metadata-heading">
      <div><p className="eyebrow">検索情報</p><h2 id="admin-shop-search-metadata-heading">既存店舗の読み・別名を編集</h2><p className="form-intro">確認済みの読みや通称を追加して、店舗検索を補強します。</p></div>
      <form action={formAction} key={selectedShop.id}>
        <label>店舗を絞り込む<input onChange={shopFilterInput.onChange} onCompositionStart={shopFilterInput.onCompositionStart} onCompositionEnd={shopFilterInput.onCompositionEnd} onKeyDown={(event) => { if (isImeCompositionEnter(event, shopFilterInput.isComposing())) event.preventDefault(); }} placeholder="店舗名・読み・別名で絞り込む" type="search" value={filter} /><span className="form-help">ひらがな・カタカナ、記号の有無、登録済みの別名でも絞り込めます。</span></label>
        <label>対象店舗<select name="shopId" onChange={(event) => setShopId(Number(event.target.value))} value={selectedShop.id}>{filteredShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
        <label>店舗名の読み<input defaultValue={selectedShop.nameKana ?? ""} maxLength={200} name="nameKana" /></label>
        <label>検索用の別名<textarea defaultValue={selectedShop.aliases.join("\n")} maxLength={2000} name="aliases" rows={3} /><span className="form-help">1行に1件（カンマ区切りも可）、最大20件です。</span></label>
        {state.status !== "idle" ? <p className={`notice ${state.status === "error" ? "error" : "success"}`} role="status">{state.message}</p> : null}
        <button className="secondary-button" disabled={pending} type="submit">{pending ? "保存中…" : "検索情報を保存"}</button>
      </form>
    </section>
  );
}
