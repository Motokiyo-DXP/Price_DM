"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AdminPriceCorrection } from "@/lib/admin-price-corrections";
import {
  initialReviewActionState,
  reviewPriceCorrectionAction,
} from "@/app/admin/actions";

const yen = (value: number | null) =>
  value === null ? "―" : `${value.toLocaleString("ja-JP")}円`;

function CorrectionReviewForm({ correction }: { correction: AdminPriceCorrection }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    reviewPriceCorrectionAction,
    initialReviewActionState,
  );

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <article className="admin-candidate">
      <h3>{correction.card_name}</h3>
      <p>{correction.shop_name} / 記録 #{correction.price_record_id}</p>
      <p>元: 販売 {yen(correction.original_sale_price)} / 買取 {yen(correction.original_buy_price)}</p>
      <p>修正案: 販売 {yen(correction.proposed_sale_price)} / 買取 {yen(correction.proposed_buy_price)}</p>
      <p>理由: {correction.reason}</p>
      <form action={formAction} className="admin-review-form">
        <input name="requestId" type="hidden" value={correction.id} />
        <label>レビュー注記（任意）<textarea maxLength={2000} name="reviewNote" rows={3} /></label>
        {state.status !== "idle" && <p className={`notice ${state.status}`}>{state.message}</p>}
        <div className="admin-review-actions">
          <button className="button" disabled={pending} name="decision" value="approved">承認して修正版を作成</button>
          <button className="secondary-button danger-button" disabled={pending} name="decision" value="rejected">却下</button>
        </div>
      </form>
    </article>
  );
}

export function AdminPriceCorrectionList({ corrections }: { corrections: AdminPriceCorrection[] }) {
  if (corrections.length === 0) return <p className="history-empty">保留中の価格修正申請はありません。</p>;
  return <div className="admin-candidate-list">{corrections.map((correction) => <CorrectionReviewForm correction={correction} key={correction.id} />)}</div>;
}
