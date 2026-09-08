import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import type { OnlineDeckSnapshot } from "@/components/online-match-board";
import { RoomWaitingRefresh } from "@/components/room-waiting-refresh";
import { setRoomReadyAction } from "../actions";

export const dynamic = "force-dynamic";

type DeckSnapshot = OnlineDeckSnapshot & { format?: string; sourceDeckId?: string };

export default async function RoomPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ roomId }, { error: message }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}`)}`);
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect(`/login?next=${encodeURIComponent(`/rooms/${roomId}`)}`);

  const [{ data: room, error }, { data: deckLabels }, { data: decks }] = await Promise.all([
    supabase.from("game_rooms").select("id, room_code, host_user_id, guest_user_id, status, format, host_ready, guest_ready, state_version, time_limit_minutes, started_at, winner_user_id, end_reason, host_rematch_ready, guest_rematch_ready").eq("id", roomId).maybeSingle(),
    supabase.rpc("get_game_room_deck_labels", { p_room_id: roomId }),
    supabase.from("decks").select("id, name, format, deck_cards(quantity, zone)").eq("owner_id", userId).order("updated_at", { ascending: false }),
  ]);
  if (error || !room) notFound();
  if (room.status === "playing" || room.status === "finished") redirect(`/rooms/${room.id}/battle`);

  const labels = deckLabels?.[0];
  const hostDeck: DeckSnapshot = { name: labels?.host_name ?? "ホストのデッキ", format: room.format, cards: [], sourceDeckId: room.host_user_id === userId ? labels?.selected_deck_id ?? undefined : undefined };
  const guestDeck: DeckSnapshot | null = room.guest_user_id ? { name: labels?.guest_name ?? "ゲストのデッキ", format: room.format, cards: [], sourceDeckId: room.guest_user_id === userId ? labels?.selected_deck_id ?? undefined : undefined } : null;
  const isHost = room.host_user_id === userId;
  const isGuest = room.guest_user_id === userId;
  const isSpectator = !isHost && !isGuest;
  const myReady = isHost ? room.host_ready : isGuest ? room.guest_ready : false;
  const playableDecks = (decks ?? []).filter((deck) =>
    deck.format === room.format
    && deck.deck_cards.filter((card) => card.zone === "main").reduce((sum, card) => sum + card.quantity, 0) === 40,
  );
  const selectedDeckId = (isHost ? hostDeck.sourceDeckId : guestDeck?.sourceDeckId) ?? playableDecks[0]?.id;
  const lobbyOpen = room.status === "waiting" || room.status === "ready";

  return <section className="room-page">
    <div className="room-page-heading"><div><p className="eyebrow">{isHost ? "ホスト" : isGuest ? "ゲスト" : "観戦者"}</p><h1>ルーム {room.room_code}</h1><p>このコードを対戦相手や観戦者に共有できます。</p></div><div><Link className="secondary-button" href={`/rooms/${room.id}`}>更新</Link><Link className="secondary-button" href="/rooms">一覧へ</Link></div></div>
    {message ? <p className="notice error">{message}</p> : null}
    <div className={`room-status ${room.status}`}><span aria-hidden="true" className="room-status-indicator" /> <strong>{room.status === "waiting" ? "対戦準備中" : room.status === "ready" ? "対戦を開始しています" : room.status === "playing" ? "対戦中" : "対戦終了"}</strong><p>{room.status === "waiting" ? "対戦者2名が準備完了すると、自動的に対戦が始まります。" : room.status === "ready" ? "初期盤面を準備しています。" : isSpectator ? "観戦者は盤面を操作できません。" : "盤面はサーバーの更新番号を基準に同期されます。"}</p>{lobbyOpen ? <RoomWaitingRefresh /> : null}</div>
    <div className="seat-grid"><article className={isHost ? "my-seat" : ""}><span>HOST</span><h2>{hostDeck.name ?? "ホストのデッキ"}</h2><p>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・40枚</p><strong>{isHost ? "あなた" : room.host_ready ? "準備完了" : "準備中"}</strong></article><article className={isGuest ? "my-seat" : ""}><span>GUEST</span>{guestDeck ? <><h2>{guestDeck.name ?? "ゲストのデッキ"}</h2><p>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・40枚</p><strong>{isGuest ? "あなた" : room.guest_ready ? "準備完了" : "準備中"}</strong></> : <><h2>参加者を待っています</h2><p>ルームコード {room.room_code} を共有してください。</p></>}</article></div>
    {!isSpectator && lobbyOpen && selectedDeckId ? <form action={setRoomReadyAction} className="room-next-step"><input name="roomId" type="hidden" value={room.id} /><input name="ready" type="hidden" value={myReady ? "false" : "true"} />{myReady ? <input name="deckId" type="hidden" value={selectedDeckId} /> : null}<label>使用するデッキ<select defaultValue={selectedDeckId} disabled={myReady} name="deckId" required>{playableDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><p>準備完了時点のデッキ内容が、この対戦専用のコピーとして固定されます。</p><button className={myReady ? "secondary-button" : "button"} type="submit">{myReady ? "準備完了を取り消す" : "準備完了"}</button></form> : null}
  </section>;
}
