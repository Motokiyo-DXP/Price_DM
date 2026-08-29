import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { OnlineMatchBoard, type OnlineDeckSnapshot } from "@/components/online-match-board";
import type { Json } from "@/lib/database.types";
import { RoomWaitingRefresh } from "@/components/room-waiting-refresh";

export const dynamic = "force-dynamic";

type DeckSnapshot = OnlineDeckSnapshot & { format?: string };

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}`)}`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}`)}`);
  const { data: room, error } = await supabase.from("game_rooms").select("*").eq("id", roomId).maybeSingle();
  if (error || !room) notFound();

  const hostDeck = room.host_deck_snapshot as unknown as DeckSnapshot;
  const guestDeck = room.guest_deck_snapshot as unknown as DeckSnapshot | null;
  const isHost = room.host_user_id === userId;
  return <section className="room-page">
    <div className="room-page-heading"><div><p className="eyebrow">{isHost ? "ホスト" : "ゲスト"}</p><h1>ルーム {room.room_code}</h1><p>このコードを対戦相手に共有してください。</p></div><div><Link className="secondary-button" href={`/rooms/${room.id}`}>更新</Link><Link className="secondary-button" href="/rooms">一覧へ</Link></div></div>
    <div className={`room-status ${room.status}`}><span aria-hidden="true" /> <strong>{room.status === "waiting" ? "対戦相手を待っています" : room.status === "ready" ? "2人そろいました" : "対戦ルーム進行中"}</strong><p>{room.status === "waiting" ? "相手が参加すると自動的に対戦準備画面へ切り替わります。" : "両者のデッキは参加時点の内容で固定されています。"}</p>{room.status === "waiting" ? <RoomWaitingRefresh /> : null}</div>
    <div className="seat-grid"><article className={isHost ? "my-seat" : ""}><span>HOST</span><h2>{hostDeck.name ?? "ホストのデッキ"}</h2><p>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・40枚</p><strong>{isHost ? "あなた" : "対戦相手"}</strong></article><article className={!isHost ? "my-seat" : ""}><span>GUEST</span>{guestDeck ? <><h2>{guestDeck.name ?? "ゲストのデッキ"}</h2><p>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・40枚</p><strong>{!isHost ? "あなた" : "対戦相手"}</strong></> : <><h2>参加者を待っています</h2><p>ルームコード {room.room_code} を共有してください。</p></>}</article></div>
    {(room.status === "ready" || room.status === "playing") && guestDeck ? <OnlineMatchBoard guestDeck={guestDeck} hostDeck={hostDeck} isHost={isHost} roomId={room.id} state={room.state as Json} stateVersion={room.state_version} status={room.status} userId={userId} /> : null}
  </section>;
}
