"use server";

import { revalidatePath } from "next/cache";
import { reviewShopCandidate } from "@/lib/admin-shop-candidates";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialReviewActionState: ReviewActionState = {
  status: "idle",
  message: "",
};

function formInteger(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function reviewShopCandidateAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const candidateId = formInteger(formData.get("candidateId"));
  const decision = formData.get("decision");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  if (
    candidateId === null ||
    (decision !== "approved" && decision !== "rejected") ||
    reviewNote.length > 2000
  ) {
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
    await reviewShopCandidate(supabase, { candidateId, decision, reviewNote });
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
