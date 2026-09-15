"use server";

import { revalidatePath } from "next/cache";
import { isUserId, normalizeFriendCode } from "@/lib/friend-code";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import type { FriendActionState } from "./action-state";

async function getAuthenticatedClient() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") return null;
  return supabase;
}

function friendRequestError(message: string): string {
  if (message.includes("friend_code_not_found")) return "該当するフレンドコードが見つかりません。";
  if (message.includes("cannot_friend_self")) return "自分自身には申請できません。";
  if (message.includes("already_friends")) return "すでにフレンドです。";
  if (message.includes("friend_request_already_sent")) return "この相手には申請済みです。";
  if (message.includes("incoming_friend_request_exists")) return "この相手から申請が届いています。申請一覧から承認してください。";
  return "フレンド申請を送信できませんでした。";
}

export async function sendFriendRequestAction(
  _previousState: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  const friendCode = normalizeFriendCode(formData.get("friendCode"));
  if (!friendCode) return { status: "error", message: "8桁のフレンドコードを入力してください。" };

  const supabase = await getAuthenticatedClient();
  if (!supabase) return { status: "error", message: "ログインし直してください。" };
  const { error } = await supabase.rpc("send_friend_request", { p_friend_code: friendCode });
  if (error) return { status: "error", message: friendRequestError(error.message) };

  revalidatePath("/friends");
  return { status: "success", message: "フレンド申請を送信しました。" };
}

export async function respondFriendRequestAction(
  _previousState: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  const requesterUserId = formData.get("requesterUserId");
  const decision = formData.get("decision");
  if (!isUserId(requesterUserId) || (decision !== "accept" && decision !== "decline")) {
    return { status: "error", message: "申請内容を確認できませんでした。" };
  }

  const supabase = await getAuthenticatedClient();
  if (!supabase) return { status: "error", message: "ログインし直してください。" };
  const { error } = await supabase.rpc("respond_friend_request", {
    p_accept: decision === "accept",
    p_requester_user_id: requesterUserId,
  });
  if (error) {
    const message = error.message.includes("friend_request_not_found")
      ? "この申請はすでに処理されています。"
      : "フレンド申請を処理できませんでした。";
    return { status: "error", message };
  }

  revalidatePath("/friends");
  return {
    status: "success",
    message: decision === "accept" ? "フレンドになりました。" : "申請を見送りました。",
  };
}
