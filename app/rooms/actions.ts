"use server";

import { redirect } from "next/navigation";
import { gameRoomErrorMessage, normalizeRoomCode, parseDeckId } from "@/lib/game-room-validation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

function roomsError(message: string): never {
  redirect(`/rooms?error=${encodeURIComponent(message)}`);
}

export async function createRoomAction(formData: FormData) {
  const deckId = parseDeckId(formData.get("deckId"));
  if (!deckId) roomsError("デッキを選択してください。");

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data, error } = await supabase.rpc("create_game_room", { p_deck_id: deckId });
  if (error || !data?.[0]) roomsError(gameRoomErrorMessage(error?.message));
  redirect(`/rooms/${data[0].id}`);
}

export async function joinRoomAction(formData: FormData) {
  const deckId = parseDeckId(formData.get("deckId"));
  const roomCode = normalizeRoomCode(formData.get("roomCode"));
  if (!deckId) roomsError("デッキを選択してください。");
  if (!roomCode) roomsError("6桁のルームコードを入力してください。");

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data, error } = await supabase.rpc("join_game_room", {
    p_deck_id: deckId,
    p_room_code: roomCode,
  });
  if (error || !data?.[0]) roomsError(gameRoomErrorMessage(error?.message));
  redirect(`/rooms/${data[0].id}`);
}
