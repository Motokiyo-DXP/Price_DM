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

export async function joinRoomAsSpectatorAction(formData: FormData) {
  const roomCode = normalizeRoomCode(formData.get("roomCode"));
  if (!roomCode) roomsError("6桁のルームコードを入力してください。");

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data, error } = await supabase.rpc("join_game_room_as_spectator", {
    p_room_code: roomCode,
  });
  if (error || !data?.[0]) roomsError(gameRoomErrorMessage(error?.message));
  redirect(`/rooms/${data[0].id}`);
}

export async function setRoomReadyAction(formData: FormData) {
  const roomId = typeof formData.get("roomId") === "string" ? String(formData.get("roomId")) : "";
  const deckId = parseDeckId(formData.get("deckId"));
  const ready = formData.get("ready") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(roomId) || !deckId) redirect("/rooms");

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/rooms/${roomId}?error=${encodeURIComponent("接続設定を確認してください。")}`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}`)}`);

  const { data, error } = await supabase.rpc("set_game_room_ready", {
    p_deck_id: deckId,
    p_ready: ready,
    p_room_id: roomId,
  });
  if (error) redirect(`/rooms/${roomId}?error=${encodeURIComponent(gameRoomErrorMessage(error.message))}`);
  if (data?.[0]?.status === "playing") redirect(`/rooms/${roomId}/battle`);
  redirect(`/rooms/${roomId}`);
}

export async function setRoomDeckAction(formData: FormData) {
  const roomId = typeof formData.get("roomId") === "string" ? String(formData.get("roomId")) : "";
  const deckId = parseDeckId(formData.get("deckId"));
  if (!/^[0-9a-f-]{36}$/i.test(roomId) || !deckId) redirect("/rooms");
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/rooms/${roomId}?error=${encodeURIComponent("接続設定を確認してください。")}`);
  const { error } = await supabase.rpc("set_game_room_ready", {
    p_room_id: roomId, p_deck_id: deckId, p_ready: false,
  });
  if (error) redirect(`/rooms/${roomId}?error=${encodeURIComponent(gameRoomErrorMessage(error.message))}`);
  redirect(`/rooms/${roomId}`);
}

export async function enterPublicRoomAction(formData: FormData) {
  const deckId = parseDeckId(formData.get("deckId"));
  const slotNumber = Number(formData.get("slotNumber"));
  if (!deckId || !Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 10) {
    roomsError("公開ルームとデッキを選択してください。");
  }

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data, error } = await supabase.rpc("enter_public_game_room", {
    p_deck_id: deckId,
    p_slot_number: slotNumber,
  });
  if (error || !data?.[0]) roomsError(gameRoomErrorMessage(error?.message));
  redirect(`/rooms/${data[0].id}`);
}

export async function createOnlineLobbyAction() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login?next=/rooms");
  const { data, error } = await supabase.rpc("create_online_lobby");
  if (error || !data?.[0]) roomsError(gameRoomErrorMessage(error?.message));
  redirect(`/rooms/lobbies/${data[0].id}`);
}

export async function openPublicLobbyAction() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") redirect("/login?next=/rooms");
  const { data, error } = await supabase.rpc("get_public_online_lobby");
  if (error || !data?.[0]) roomsError(gameRoomErrorMessage(error?.message));
  redirect(`/rooms/lobbies/${data[0].id}`);
}

export async function joinOnlineLobbyByCodeAction(formData: FormData) {
  const joinCode = normalizeRoomCode(formData.get("joinCode"));
  if (!joinCode) roomsError("ルームIDが正しくありません。");
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) roomsError("接続設定を確認してください。");
  const { data, error } = await supabase.rpc("join_online_lobby_by_code", { p_join_code: joinCode });
  if (error || !data?.[0]) roomsError("ルームIDが正しくありません。");
  redirect(`/rooms/lobbies/${data[0].id}`);
}

export async function setOnlineLobbySelectedDeckAction(formData: FormData) {
  const lobbyId = typeof formData.get("lobbyId") === "string" ? String(formData.get("lobbyId")) : "";
  const deckId = parseDeckId(formData.get("deckId"));
  if (!/^[0-9a-f-]{36}$/i.test(lobbyId) || !deckId) redirect("/rooms");
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent("接続設定を確認してください。")}`);
  const { error } = await supabase.rpc("set_online_lobby_selected_deck", { p_deck_id: deckId, p_lobby_id: lobbyId });
  if (error) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent("使用デッキを変更できませんでした。")}`);
  redirect(`/rooms/lobbies/${lobbyId}?notice=${encodeURIComponent("使用デッキを変更しました。")}`);
}

export async function enterOnlineMatchSlotAction(formData: FormData) {
  const slotId = typeof formData.get("slotId") === "string" ? String(formData.get("slotId")) : "";
  const lobbyId = typeof formData.get("lobbyId") === "string" ? String(formData.get("lobbyId")) : "";
  const role = formData.get("role") === "spectator" ? "spectator" : "player";
  const format = formData.get("format") === "advanced" ? "advanced" : "original";
  const timeLimit = Number(formData.get("timeLimit"));
  const deckIsPublic = formData.getAll("deckIsPublic").includes("true");
  if (!/^[0-9a-f-]{36}$/i.test(slotId) || !/^[0-9a-f-]{36}$/i.test(lobbyId) || !Number.isInteger(timeLimit)) {
    redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent("マッチ設定を確認してください。")}`);
  }
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent("接続設定を確認してください。")}`);
  const { data: selectedLobbyDeck } = role === "player"
    ? await supabase.from("online_lobby_members").select("selected_deck_id").eq("lobby_id", lobbyId).maybeSingle()
    : { data: null };
  const deckId = role === "player" ? parseDeckId(selectedLobbyDeck?.selected_deck_id ?? null) : null;
  if (role === "player" && !deckId) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent("先にロビーの使用デッキを選択してください。")}`);
  const { data, error } = await supabase.rpc("enter_online_match_slot", {
    p_deck_id: deckId,
    p_deck_is_public: deckIsPublic,
    p_format: format,
    p_role: role,
    p_slot_id: slotId,
    p_time_limit_minutes: timeLimit,
  });
  if (error || !data?.[0]) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent(gameRoomErrorMessage(error?.message))}`);
  if (role === "player" && deckId && (data[0].member_role === "host" || data[0].member_role === "guest")) {
    const roomId = data[0].game_room_id;
    const { data: labels, error: labelsError } = await supabase.rpc("get_game_room_deck_labels", { p_room_id: roomId });
    if (labelsError) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent(gameRoomErrorMessage(labelsError.message))}`);
    if (labels?.[0]?.selected_deck_id !== deckId) {
      const { error: deckError } = await supabase.rpc("set_game_room_ready", {
        p_room_id: roomId, p_deck_id: deckId, p_ready: false,
      });
      if (deckError) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent(gameRoomErrorMessage(deckError.message))}`);
    }
  }
  redirect(`/rooms/${data[0].game_room_id}`);
}

export async function acceptOnlineLobbyInvitationAction(formData: FormData) {
  const invitationId = typeof formData.get("invitationId") === "string" ? String(formData.get("invitationId")) : "";
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) redirect("/rooms/invites");
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/rooms/invites");
  const { data, error } = await supabase.rpc("accept_online_lobby_invitation", { p_invitation_id: invitationId });
  if (error || !data?.[0]) redirect(`/rooms/invites?error=${encodeURIComponent("招待を開けませんでした。")}`);
  redirect(`/rooms/lobbies/${data[0].lobby_id}`);
}

export async function sendOnlineLobbyFriendInvitationAction(formData: FormData) {
  const lobbyId = typeof formData.get("lobbyId") === "string" ? String(formData.get("lobbyId")) : "";
  const friendUserId = typeof formData.get("friendUserId") === "string" ? String(formData.get("friendUserId")) : "";
  if (!/^[0-9a-f-]{36}$/i.test(lobbyId) || !/^[0-9a-f-]{36}$/i.test(friendUserId)) redirect("/rooms");
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent("接続設定を確認してください。")}`);
  const { error } = await supabase.rpc("send_online_lobby_friend_invitation", { p_friend_user_id: friendUserId, p_lobby_id: lobbyId });
  if (error) {
    const message = error.message.includes("friendship_required") ? "フレンド関係を確認できませんでした。" : error.message.includes("friend_already_in_lobby") ? "そのフレンドはすでに参加しています。" : "招待を送信できませんでした。";
    redirect(`/rooms/lobbies/${lobbyId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/rooms/lobbies/${lobbyId}?notice=${encodeURIComponent("招待を送信しました。")}`);
}
