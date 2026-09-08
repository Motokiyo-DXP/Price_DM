"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  deletePendingShopCandidate,
  reviewShopCandidate,
} from "@/lib/admin-shop-candidates";
import {
  deleteRegisteredShop,
  updateAdminShopDetails,
} from "@/lib/admin-shop-details";
import {
  validateAdminShopDeletionInput,
  validateAdminShopDetailsInput,
} from "@/lib/admin-shop-details-validation";
import { createShopForAdmin } from "@/lib/admin-shop-registration";
import { updateShopSearchMetadata } from "@/lib/admin-shop-search-metadata";
import { validateShopSearchMetadataInput } from "@/lib/admin-shop-search-metadata-validation";
import { validateAdminShopRegistrationInput } from "@/lib/admin-shop-registration-validation";
import { reviewPriceCorrection } from "@/lib/admin-price-corrections";
import { reviewShopCorrection } from "@/lib/admin-shop-corrections";
import { MARKET_CARDS_CACHE_TAG } from "@/lib/market-data";
import {
  validateAdminCandidateDeletionInput,
  validateAdminReviewInput,
} from "@/lib/admin-review-validation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import type {
  ReviewActionState,
  ShopRegistrationActionState,
} from "./action-state";

export async function createShopForAdminAction(
  _previousState: ShopRegistrationActionState,
  formData: FormData,
): Promise<ShopRegistrationActionState> {
  const input = validateAdminShopRegistrationInput(
    formData.get("name"),
    formData.get("nameKana"),
    formData.get("aliases"),
    formData.get("prefecture"),
    formData.get("municipality"),
    formData.get("addressLine"),
    formData.get("websiteUrl"),
    formData.get("reviewNote"),
  );
  if (!input) {
    return { status: "error", message: "必須項目、文字数、URLを確認してください。" };
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
    const shop = await createShopForAdmin(supabase, input);
    revalidatePath("/admin");
    revalidatePath("/register");
    return {
      status: "success",
      message: `「${shop.name}」を登録しました。`,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") {
      return { status: "error", message: "管理者権限がありません。" };
    }
    if (message === "shop_already_exists") {
      return { status: "error", message: "同名の承認済み店舗が既に登録されています。" };
    }
    if (message === "shop_candidate_pending") {
      return { status: "error", message: "同名の保留中候補があります。候補一覧から確認してください。" };
    }
    return { status: "error", message: "店舗を登録できませんでした。入力内容を再確認してください。" };
  }
}

export async function updateShopSearchMetadataAction(
  _previousState: ShopRegistrationActionState,
  formData: FormData,
): Promise<ShopRegistrationActionState> {
  const input = validateShopSearchMetadataInput(formData.get("shopId"), formData.get("nameKana"), formData.get("aliases"));
  if (!input) return { status: "error", message: "読み・別名の内容を確認してください。" };
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return { status: "error", message: "接続設定を確認してください。" };
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") return { status: "error", message: "ログインし直してください。" };
  try { await updateShopSearchMetadata(supabase, input); } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") return { status: "error", message: "管理者権限がありません。" };
    if (message === "shop_not_found") return { status: "error", message: "対象店舗が見つかりません。" };
    return { status: "error", message: "検索情報を保存できませんでした。" };
  }
  revalidatePath("/admin"); revalidatePath("/register");
  return { status: "success", message: "検索情報を保存しました。" };
}

export async function updateShopDetailsAction(
  _previousState: ShopRegistrationActionState,
  formData: FormData,
): Promise<ShopRegistrationActionState> {
  const input = validateAdminShopDetailsInput(
    formData.get("shopId"),
    formData.get("name"),
    formData.get("nameKana"),
    formData.get("aliases"),
    formData.get("prefecture"),
    formData.get("municipality"),
    formData.get("addressLine"),
    formData.get("websiteUrl"),
  );
  if (!input) {
    return { status: "error", message: "必須項目、文字数、URLを確認してください。" };
  }

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return { status: "error", message: "接続設定を確認してください。" };
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") {
    return { status: "error", message: "ログインし直してください。" };
  }

  try {
    await updateAdminShopDetails(supabase, input);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") {
      return { status: "error", message: "管理者権限がありません。" };
    }
    if (message === "shop_not_found") {
      return { status: "error", message: "対象店舗が見つかりません。" };
    }
    if (message === "shop_already_exists" || message === "23505") {
      return { status: "error", message: "同じ名前の店舗が既に登録されています。" };
    }
    return { status: "error", message: "店舗情報を保存できませんでした。" };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/register");
  return { status: "success", message: `「${input.name}」の店舗情報を保存しました。` };
}

export async function deleteRegisteredShopAction(
  _previousState: ShopRegistrationActionState,
  formData: FormData,
): Promise<ShopRegistrationActionState> {
  const shopId = validateAdminShopDeletionInput(formData.get("shopId"));
  if (!shopId) {
    return { status: "error", message: "削除対象の店舗を確認してください。" };
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
    const deletedName = await deleteRegisteredShop(supabase, shopId);
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/register");
    return {
      status: "success",
      message: `「${deletedName}」を登録済み店舗から削除しました。`,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") {
      return { status: "error", message: "管理者権限がありません。" };
    }
    if (message === "shop_not_found") {
      return { status: "error", message: "対象の店舗が見つかりません。" };
    }
    if (message === "shop_has_price_records") {
      return {
        status: "error",
        message: "価格履歴がある店舗は削除できません。店舗情報の修正を利用してください。",
      };
    }
    return {
      status: "error",
      message: "店舗を削除できませんでした。一覧を更新して再確認してください。",
    };
  }
}

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

export async function deletePendingShopCandidateAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const candidateId = validateAdminCandidateDeletionInput(
    formData.get("candidateId"),
  );
  if (!candidateId) {
    return { status: "error", message: "削除対象の候補を確認してください。" };
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
    const deletedName = await deletePendingShopCandidate(supabase, candidateId);
    revalidatePath("/admin");
    return {
      status: "success",
      message: `「${deletedName}」を保留中候補から削除しました。`,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") {
      return { status: "error", message: "管理者権限がありません。" };
    }
    if (message === "shop_candidate_not_found") {
      return { status: "error", message: "対象の候補が見つかりません。" };
    }
    if (message === "shop_candidate_not_pending") {
      return {
        status: "error",
        message: "この候補はすでに処理済みのため削除できません。",
      };
    }
    return {
      status: "error",
      message: "候補を削除できませんでした。一覧を更新して再確認してください。",
    };
  }
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
  revalidateTag(MARKET_CARDS_CACHE_TAG);
  return { status: "success", message: "価格修正申請を処理しました。" };
}

export async function reviewShopCorrectionAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const review = validateAdminReviewInput(
    formData.get("requestId"),
    formData.get("decision"),
    formData.get("reviewNote"),
  );
  if (!review) return { status: "error", message: "入力内容を確認してください。" };

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return { status: "error", message: "認証設定を確認してください。" };
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") {
    return { status: "error", message: "ログインし直してください。" };
  }

  try {
    await reviewShopCorrection(supabase, {
      requestId: review.id,
      decision: review.decision,
      reviewNote: review.reviewNote,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") return { status: "error", message: "管理者権限がありません。" };
    if (message === "P0001") {
      return { status: "error", message: "この依頼は処理済み、または店舗を利用できません。" };
    }
    return { status: "error", message: "店舗情報修正依頼の処理に失敗しました。" };
  }

  revalidatePath("/admin");
  revalidatePath("/register");
  return { status: "success", message: "店舗情報修正依頼を処理しました。" };
}
