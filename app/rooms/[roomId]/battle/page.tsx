import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OnlineMatchBoard, type OnlineDeckSnapshot } from "@/components/online-match-board";
import type { Json } from "@/lib/database.types";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { LONG_PRESS_DEFAULT_MS } from "@/lib/play-input-settings";

export const dynamic = "force-dynamic";

export default async function OnlineBattlePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) notFound();

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}/battle`)}`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}/battle`)}`);

  const [{ data: room, error: roomError }, { data: roomState, error: stateError }, { data: deckLabels }, { data: matchSlot }, { data: profile }] = await Promise.all([
    supabase.from("game_rooms").select("id, host_user_id, guest_user_id, status, format, time_limit_minutes, started_at, winner_user_id, end_reason, host_rematch_ready, guest_rematch_ready").eq("id", roomId).maybeSingle(),
    supabase.rpc("get_game_room_state", { p_room_id: roomId }),
    supabase.rpc("get_game_room_deck_labels", { p_room_id: roomId }),
    supabase.from("online_match_slots").select("lobby_id").eq("game_room_id", roomId).maybeSingle(),
    supabase.from("profiles").select("long_press_ms").eq("user_id", userId).maybeSingle(),
  ]);
  if (roomError || !room) notFound();
  if (room.status === "waiting" || room.status === "ready") redirect(`/rooms/${room.id}`);

  const state = roomState?.[0];
  if (stateError || !state || !room.guest_user_id) {
    return <section className="room-page"><p className="notice error">対戦盤面を取得できませんでした。</p><div><Link className="secondary-button" href={`/rooms/${room.id}/battle`}>再読み込み</Link><Link className="secondary-button" href="/rooms">ルーム一覧へ</Link></div></section>;
  }

  const labels = deckLabels?.[0];
  const hostDeck: OnlineDeckSnapshot = { name: labels?.host_name ?? "ホストのデッキ", format: room.format, cards: [] };
  const guestDeck: OnlineDeckSnapshot = { name: labels?.guest_name ?? "ゲストのデッキ", format: room.format, cards: [] };
  const isHost = room.host_user_id === userId;
  const isGuest = room.guest_user_id === userId;

  return <section className="online-battle-page"><OnlineMatchBoard endReason={room.end_reason} guestDeck={guestDeck} guestRematchReady={room.guest_rematch_ready} hostDeck={hostDeck} hostRematchReady={room.host_rematch_ready} initialLongPressMs={profile?.long_press_ms ?? LONG_PRESS_DEFAULT_MS} isHost={isHost} isSpectator={!isHost && !isGuest} returnLobbyId={matchSlot?.lobby_id ?? null} roomId={room.id} startedAt={room.started_at} state={state.state as Json} stateVersion={state.state_version} status={room.status} timeLimitMinutes={room.time_limit_minutes} userId={userId} winnerUserId={room.winner_user_id} /></section>;
}

