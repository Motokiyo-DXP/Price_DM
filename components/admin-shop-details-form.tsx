"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRegisteredShopAction,
  updateShopDetailsAction,
} from "@/app/admin/actions";
import { initialShopRegistrationActionState } from "@/app/admin/action-state";
import {
  canDeleteRegisteredShop,
  type AdminShopDetails,
} from "@/lib/admin-shop-details";
import { JAPAN_PREFECTURES } from "@/lib/prefectures";
import { normalizeShopSearch } from "@/lib/search-normalization";
import { useImeRealtimeInput } from "@/lib/use-ime-realtime-input";

export function AdminShopDetailsForm({ shops }: { shops: AdminShopDetails[] }) {
  const router = useRouter();
  const [shopId, setShopId] = useState(shops[0]?.id ?? 0);
  const shopFilterInput = useImeRealtimeInput();
  const filter = shopFilterInput.value;
  const [state, formAction, pending] = useActionState(
    updateShopDetailsAction,
    initialShopRegistrationActionState,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteRegisteredShopAction,
    initialShopRegistrationActionState,
  );

  const filteredShops = useMemo(() => {
    const normalizedFilter = normalizeShopSearch(filter);
    if (!normalizedFilter) return shops;

    return shops.filter((shop) =>
      normalizeShopSearch([
        shop.name,
        shop.nameKana,
        ...shop.aliases,
        shop.prefecture,
        shop.municipality,
        shop.addressLine,
      ].filter(Boolean).join(" ")).includes(normalizedFilter),
    );
  }, [filter, shops]);

  const coverage = useMemo(() => shops.reduce((summary, shop) => ({
    missingRegion: summary.missingRegion + Number(!shop.prefecture || !shop.municipality),
    missingWebsite: summary.missingWebsite + Number(!shop.websiteUrl),
    missingReading: summary.missingReading + Number(!shop.nameKana),
    missingAliases: summary.missingAliases + Number(shop.aliases.length === 0),
  }), {
    missingRegion: 0,
    missingWebsite: 0,
    missingReading: 0,
    missingAliases: 0,
  }), [shops]);

  const selectedShop = useMemo(
    () => filteredShops.find((shop) => shop.id === shopId) ?? filteredShops[0] ?? null,
    [filteredShops, shopId],
  );
  const selectedShopCanBeDeleted = selectedShop
    ? canDeleteRegisteredShop(selectedShop)
    : false;

  useEffect(() => {
    if (selectedShop && selectedShop.id !== shopId) {
      setShopId(selectedShop.id);
    }
  }, [selectedShop, shopId]);

  useEffect(() => {
    if (deleteState.status === "success") router.refresh();
  }, [deleteState.status, router]);

  return (
    <section className="admin-registration-panel" aria-labelledby="admin-shop-details-heading">
      <div>
        <p className="eyebrow">店舗マスター</p>
        <h2 id="admin-shop-details-heading">登録済み店舗を編集</h2>
        <p className="form-intro">
          店舗名、所在地、公式URL、検索用の読み・別名を修正します。変更履歴はDBに保存されます。
        </p>
        <p className="shop-coverage-summary" role="status">
          全{shops.length.toLocaleString("ja-JP")}件
          ／地域情報不足 {coverage.missingRegion.toLocaleString("ja-JP")}件
          ／公式URL不足 {coverage.missingWebsite.toLocaleString("ja-JP")}件
          ／読み不足 {coverage.missingReading.toLocaleString("ja-JP")}件
          ／別名不足 {coverage.missingAliases.toLocaleString("ja-JP")}件
        </p>
      </div>
      <label>
        店舗を絞り込む
        <input
          onChange={shopFilterInput.onChange}
          onCompositionStart={shopFilterInput.onCompositionStart}
          onCompositionEnd={shopFilterInput.onCompositionEnd}
          placeholder="店舗名・読み・別名・所在地で絞り込む"
          type="search"
          value={filter}
        />
        <span className="form-help">
          ひらがな・カタカナ、記号の有無、登録済みの別名でも絞り込めます。
        </span>
      </label>
      {selectedShop ? (
        <form action={formAction} key={selectedShop.id}>
          <label>
            対象店舗
            <select
              name="shopId"
              onChange={(event) => setShopId(Number(event.target.value))}
              value={selectedShop.id}
            >
              {filteredShops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </select>
          </label>
          <label>
            店舗名（必須）
            <input defaultValue={selectedShop.name} maxLength={200} name="name" required />
          </label>
          <label>
            店舗名の読み（任意）
            <input defaultValue={selectedShop.nameKana ?? ""} maxLength={200} name="nameKana" />
          </label>
          <label>
            検索用の別名（任意）
            <textarea
              defaultValue={selectedShop.aliases.join("\n")}
              maxLength={2000}
              name="aliases"
              rows={3}
            />
            <span className="form-help">1行に1件（カンマ区切りも可）、最大20件です。</span>
          </label>
          <div className="two">
            <label>
              都道府県（必須）
              <select defaultValue={selectedShop.prefecture ?? ""} name="prefecture" required>
                <option disabled value="">選択してください</option>
                {JAPAN_PREFECTURES.map((prefecture) => (
                  <option key={prefecture} value={prefecture}>{prefecture}</option>
                ))}
              </select>
            </label>
            <label>
              市区町村
              <input
                autoComplete="address-level2"
                defaultValue={selectedShop.municipality ?? ""}
                maxLength={100}
                name="municipality"
              />
            </label>
          </div>
          <label>
            番地・建物名
            <input
              autoComplete="street-address"
              defaultValue={selectedShop.addressLine ?? ""}
              maxLength={300}
              name="addressLine"
            />
          </label>
          <label>
            公式サイトURL
            <input
              defaultValue={selectedShop.websiteUrl ?? ""}
              inputMode="url"
              maxLength={500}
              name="websiteUrl"
              placeholder="https://..."
              type="url"
            />
          </label>
          <p className="form-help" role="status">
            価格履歴: {selectedShop.priceRecordCount.toLocaleString("ja-JP")}件
            {selectedShop.priceRecordCount > 0
              ? "（価格履歴があるため、この店舗は削除できません）"
              : "（削除可能）"}
          </p>
          {state.status !== "idle" ? (
            <p
              className={`notice ${state.status === "error" ? "error" : "success"}`}
              role="status"
            >
              {state.message}
            </p>
          ) : null}
          {deleteState.status !== "idle" ? (
            <p
              className={`notice ${deleteState.status === "error" ? "error" : "success"}`}
              role="status"
            >
              {deleteState.message}
            </p>
          ) : null}
          <div className="admin-shop-actions">
            <button
              className="secondary-button"
              disabled={pending || deletePending}
              type="submit"
            >
              {pending ? "保存中…" : "店舗情報を保存"}
            </button>
            <button
              className="secondary-button danger-button"
              disabled={pending || deletePending || !selectedShopCanBeDeleted}
              formAction={deleteFormAction}
              formNoValidate
              onClick={(event) => {
                if (
                  !window.confirm(
                    `「${selectedShop.name}」を登録済み店舗から削除します。価格履歴がある場合は削除されません。よろしいですか？`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
              type="submit"
            >
              <span aria-hidden="true" className="ui-icon ui-icon-trash" />{deletePending ? "削除中…" : "登録済み店舗を削除"}
            </button>
          </div>
          <p className="form-help">
            価格履歴のない誤登録店舗だけ削除できます。価格履歴の有無は画面とDBの両方で確認し、削除内容は非公開の監査記録に保存されます。
          </p>
        </form>
      ) : (
        <p className="history-empty">
          {filter
            ? "一致する店舗がありません。絞り込み条件を変えてください。"
            : "編集できる店舗がありません。"}
        </p>
      )}
    </section>
  );
}

