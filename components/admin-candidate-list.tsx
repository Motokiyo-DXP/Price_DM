"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AdminShopCandidate } from "@/lib/admin-shop-candidates";
import {
  deletePendingShopCandidateAction,
  reviewShopCandidateAction,
} from "@/app/admin/actions";
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
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deletePendingShopCandidateAction,
    initialReviewActionState,
  );

  useEffect(() => {
    if (state.status === "success" || deleteState.status === "success") {
      router.refresh();
    }
  }, [deleteState.status, router, state.status]);

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
      <form
        action={deleteFormAction}
        className="admin-delete-form"
        onSubmit={(event) => {
          if (
            !window.confirm(
              `「${candidate.name}」を保留中候補から削除します。元に戻せません。よろしいですか？`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="candidateId" type="hidden" value={candidate.id} />
        <p className="notice">
          誤って登録した保留中候補だけを削除してください。承認済み店舗は削除されません。
        </p>
        {deleteState.status !== "idle" ? (
          <p
            className={`notice ${deleteState.status === "error" ? "error" : "success"}`}
          >
            {deleteState.message}
          </p>
        ) : null}
        <button
          className="secondary-button danger-button"
          disabled={deletePending || pending}
          type="submit"
        >
          {deletePending ? "削除中…" : "候補を削除"}
        </button>
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
