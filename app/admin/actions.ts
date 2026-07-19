"use server";

import { revalidatePath } from "next/cache";
import { reviewShopCandidate } from "@/lib/admin-shop-candidates";
import { reviewPriceCorrection } from "@/lib/admin-price-corrections";
import { validateAdminReviewInput } from "@/lib/admin-review-validation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialReviewActionState: ReviewActionState = {
  status: "idle",
  message: "",
};

export async function reviewShopCandidateAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const review = validateAdminReviewInput(
    formData.get("candidateId"),
    formData.get("decision"),
    formData.get("reviewNote"),
  );
  if (!review) {
    return { status: "error", message: "入力内容を確認してください。" };
  }

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) {
    return { status: "error", message: "接続設定を確認してください。" };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") {
    return { status: "error", message: "ログインし直してください。" };
  }

  try {
    await reviewShopCandidate(supabase, {
      candidateId: review.id,
      decision: review.decision,
      reviewNote: review.reviewNote,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") {
      return { status: "error", message: "管理権限がありません。" };
    }
    if (message === "P0001") {
      return {
        status: "error",
        message: "この候補は既に処理済みか、存在しません。",
      };
    }
    return { status: "error", message: "処理に失敗しました。一覧を更新して再確認してください。" };
  }

  revalidatePath("/admin");
  return { status: "success", message: "候補を処理しました。" };
}

export async function reviewPriceCorrectionAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const review = validateAdminReviewInput(
    formData.get("requestId"),
    formData.get("decision"),
    formData.get("reviewNote"),
  );
  if (!review) {
    return { status: "error", message: "入力内容を確認してください。" };
  }
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return { status: "error", message: "認証設定を確認してください。" };
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") {
    return { status: "error", message: "ログインし直してください。" };
  }
  try {
    await reviewPriceCorrection(supabase, {
      requestId: review.id,
      decision: review.decision,
      reviewNote: review.reviewNote,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") return { status: "error", message: "管理者権限がありません。" };
    if (message === "P0001") return { status: "error", message: "この申請は既に処理済み、または元記録が利用できません。" };
    return { status: "error", message: "処理に失敗しました。" };
  }
  revalidatePath("/admin");
  return { status: "success", message: "価格修正申請を処理しました。" };
}
