"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createShopForAdminAction,
  initialShopRegistrationActionState,
} from "@/app/admin/actions";
import { JAPAN_PREFECTURES } from "@/lib/prefectures";

export function AdminShopRegistrationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createShopForAdminAction,
    initialShopRegistrationActionState,
  );

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.message, state.status]);

  return (
    <section className="admin-registration-panel" aria-labelledby="admin-shop-registration-heading">
      <div>
        <p className="eyebrow">店舗マスター</p>
        <h2 id="admin-shop-registration-heading">店舗を直接登録</h2>
        <p className="form-intro">
          公式情報を確認した店舗を、承認済み店舗としてすぐに登録します。
        </p>
      </div>
      <form action={formAction} ref={formRef}>
        <label>
          店舗名（必須）
          <input autoComplete="organization" maxLength={200} name="name" required />
        </label>
        <div className="two">
          <label>
            都道府県（必須）
            <select defaultValue="" name="prefecture" required>
              <option disabled value="">選択してください</option>
              {JAPAN_PREFECTURES.map((prefecture) => (
                <option key={prefecture} value={prefecture}>{prefecture}</option>
              ))}
            </select>
          </label>
          <label>
            市区町村
            <input autoComplete="address-level2" maxLength={100} name="municipality" />
          </label>
        </div>
        <label>
          番地・建物名
          <input autoComplete="street-address" maxLength={300} name="addressLine" />
        </label>
        <label>
          公式サイトURL
          <input inputMode="url" maxLength={500} name="websiteUrl" placeholder="https://..." type="url" />
        </label>
        <label>
          確認メモ（任意）
          <textarea
            maxLength={2000}
            name="reviewNote"
            placeholder="確認した公式情報や登録理由"
            rows={3}
          />
        </label>
        {state.status !== "idle" ? (
          <p className={`notice ${state.status === "error" ? "error" : "success"}`} role="status">
            {state.message}
          </p>
        ) : null}
        <button className="button" disabled={pending} type="submit">
          {pending ? "登録中…" : "承認済み店舗として登録"}
        </button>
      </form>
    </section>
  );
}
