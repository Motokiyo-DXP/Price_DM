"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRegisteredShopAction,
  updateShopDetailsAction,
} from "@/app/admin/actions";
import { initialShopRegistrationActionState } from "@/app/admin/action-state";
import type { AdminShopDetails } from "@/lib/admin-shop-details";
import { JAPAN_PREFECTURES } from "@/lib/prefectures";
import { normalizeShopSearch } from "@/lib/search-normalization";

export function AdminShopDetailsForm({ shops }: { shops: AdminShopDetails[] }) {
  const router = useRouter();
  const [shopId, setShopId] = useState(shops[0]?.id ?? 0);
  const [filter, setFilter] = useState("");
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

  const selectedShop = useMemo(
    () => filteredShops.find((shop) => shop.id === shopId) ?? filteredShops[0] ?? null,
    [filteredShops, shopId],
  );

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
      </div>
      <label>
        店舗を絞り込む
        <input
          onChange={(event) => setFilter(event.target.value)}
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
              disabled={pending || deletePending}
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
              {deletePending ? "削除中…" : "登録済み店舗を削除"}
            </button>
          </div>
          <p className="form-help">
            価格履歴のない誤登録店舗だけ削除できます。削除内容は非公開の監査記録に保存されます。
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

