"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { reviewShopCorrectionAction } from "@/app/admin/actions";
import { initialReviewActionState } from "@/app/admin/action-state";
import type { AdminShopCorrection } from "@/lib/admin-shop-corrections";

function display(value: string | null) { return value || "未設定"; }

function Difference({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  if (after === null) return null;
  return <p><strong>{label}</strong>: {display(before)} → {display(after)}</p>;
}

function ShopCorrectionReviewForm({ correction }: { correction: AdminShopCorrection }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(reviewShopCorrectionAction, initialReviewActionState);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);

  return (
    <article className="admin-candidate">
      <h3>{correction.original_name}</h3>
      <p className="detail-meta">店舗 #{correction.shop_id}</p>
      <Difference label="店舗名" before={correction.original_name} after={correction.proposed_name} />
      <Difference label="読み" before={correction.original_name_kana} after={correction.proposed_name_kana} />
      {correction.proposed_aliases !== null && (
        <p><strong>別名</strong>: {correction.original_aliases.join("、") || "未設定"} → {correction.proposed_aliases.join("、")}</p>
      )}
      <Difference label="都道府県" before={correction.original_prefecture} after={correction.proposed_prefecture} />
      <Difference label="市区町村" before={correction.original_municipality} after={correction.proposed_municipality} />
      <Difference label="住所" before={correction.original_address_line} after={correction.proposed_address_line} />
      <Difference label="公式URL" before={correction.original_website_url} after={correction.proposed_website_url} />
      <p><strong>修正理由</strong>: {correction.reason}</p>
      <form action={formAction} className="admin-review-form">
        <input name="requestId" type="hidden" value={correction.id} />
        <label>レビュー注記（任意）<textarea maxLength={2000} name="reviewNote" rows={3} /></label>
        {state.status !== "idle" && <p className={`notice ${state.status}`}>{state.message}</p>}
        <div className="admin-review-actions">
          <button className="button" disabled={pending} name="decision" value="approved">承認して店舗情報へ反映</button>
          <button className="secondary-button danger-button" disabled={pending} name="decision" value="rejected">却下</button>
        </div>
      </form>
    </article>
  );
}

export function AdminShopCorrectionList({ corrections }: { corrections: AdminShopCorrection[] }) {
  if (corrections.length === 0) return <p className="history-empty">保留中の店舗情報修正依頼はありません。</p>;
  return <div className="admin-candidate-list">{corrections.map((correction) => <ShopCorrectionReviewForm correction={correction} key={correction.id} />)}</div>;
}
