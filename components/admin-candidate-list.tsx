"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AdminShopCandidate } from "@/lib/admin-shop-candidates";
import { reviewShopCandidateAction } from "@/app/admin/actions";
import { initialReviewActionState } from "@/app/admin/action-state";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "日時不明"
    : new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function CandidateReviewForm({ candidate }: { candidate: AdminShopCandidate }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    reviewShopCandidateAction,
    initialReviewActionState,
  );

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <article className="admin-candidate">
      <div className="admin-candidate-heading">
        <div>
          <h2>{candidate.name}</h2>
          <p>
            {candidate.prefecture ?? "都道府県未入力"}
            {candidate.municipality ? ` ${candidate.municipality}` : ""}
            {candidate.addressLine ? ` ${candidate.addressLine}` : ""}
          </p>
        </div>
        <span className="tag">申請 {candidate.submissionCount} 回</span>
      </div>
      {candidate.websiteUrl ? (
        <p>
          <a href={candidate.websiteUrl} rel="noreferrer" target="_blank">
            公式サイトを開く
          </a>
        </p>
      ) : null}
      <p className="notice">初回申請: {formatDate(candidate.submittedAt)}</p>
      <p className="notice">最終申請: {formatDate(candidate.lastSubmittedAt)}</p>
      <form action={formAction} className="admin-review-form">
        <input name="candidateId" type="hidden" value={candidate.id} />
        <label>
          レビュー記録（任意）
          <textarea maxLength={2000} name="reviewNote" rows={3} />
        </label>
        {state.status !== "idle" ? (
          <p className={`notice ${state.status === "error" ? "error" : "success"}`}>
            {state.message}
          </p>
        ) : null}
        <div className="admin-review-actions">
          <button className="button" disabled={pending} name="decision" value="approved">
            承認
          </button>
          <button
            className="secondary-button danger-button"
            disabled={pending}
            name="decision"
            value="rejected"
          >
            却下
          </button>
        </div>
      </form>
    </article>
  );
}

export function AdminCandidateList({ candidates }: { candidates: AdminShopCandidate[] }) {
  if (candidates.length === 0) {
    return <p className="history-empty">保留中の店舗候補はありません。</p>;
  }

  return <div className="admin-candidate-list">{candidates.map((candidate) => <CandidateReviewForm candidate={candidate} key={candidate.id} />)}</div>;
}
