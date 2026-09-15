import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
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
    supabase.from("decks").select("id, name, format, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, quantity, zone)").eq("owner_id", userId).order("updated_at", { ascending: false }),
  ]);
  if (error || !room) notFound();
  if (room.status === "playing" || room.status === "finished") redirect(`/rooms/${room.id}/battle`);

  const participantIds = [room.host_user_id, room.guest_user_id].filter((id): id is string => Boolean(id));
  const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", participantIds);
  const profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

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
  const selectedDeck = playableDecks.find((deck) => deck.id === selectedDeckId);
  const selectedIconId = selectedDeck?.icon_canonical_card_id ?? selectedDeck?.deck_cards.find((card) => card.zone === "main")?.canonical_card_id;
  const selectedIconCard = selectedDeck?.deck_cards.find((card) => card.zone === "main" && card.canonical_card_id === selectedIconId);
  const { data: iconPrints } = selectedIconId ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").eq("canonical_card_id", selectedIconId).not("image_key", "is", null).order("id") : { data: [] };
  const orderedIconPrints = sortCardPrintsOldestFirst(iconPrints ?? []);
  const selectedImageKey = (selectedIconCard?.card_print_id ? orderedIconPrints.find((print) => print.id === selectedIconCard.card_print_id)?.image_key : null) ?? orderedIconPrints[0]?.image_key;
  const selectedDeckImageUrl = getCardImageUrl(selectedImageKey);
  const hostProfile = profileByUserId.get(room.host_user_id);
  const guestProfile = room.guest_user_id ? profileByUserId.get(room.guest_user_id) : undefined;
  const lobbyOpen = room.status === "waiting" || room.status === "ready";

  return <section className="room-page">
    <header className="room-ready-header"><Link aria-label="オンライン対戦メニューへ戻る" href="/rooms">‹</Link><div><p>ONLINE MATCH</p><h1>対戦準備</h1></div><Link aria-label="参加状況を更新" className="room-ready-refresh" href={`/rooms/${room.id}`}>↻</Link></header>
    {message ? <p className="notice error">{message}</p> : null}
    <section className="room-ready-meta"><div><small>ルームID</small><strong>{room.room_code}</strong><span>対戦相手へ共有</span></div><div><small>ルール・制限時間</small><strong>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・{room.time_limit_minutes}分</strong><span>{isHost ? "ホスト" : isGuest ? "ゲスト" : "観戦者"}として参加</span></div></section>
    <div className="seat-grid">
      <article className={isHost ? "my-seat" : ""}><header><span>{isHost ? "自分（01）" : "対戦相手（01）"}</span><strong className={room.host_ready ? "ready" : "waiting"}>{room.host_ready ? "準備完了" : "準備中"}</strong></header><div><span aria-label={`${hostProfile?.display_name ?? "ホスト"}のアカウントアイコン`} className={`room-player-avatar ${hostProfile?.avatar_url ? "has-image" : ""}`} style={hostProfile?.avatar_url ? { backgroundImage: `url("${hostProfile.avatar_url}")` } : undefined}>{hostProfile?.avatar_url ? null : (hostProfile?.display_name ?? (isHost ? "自分" : "相手")).slice(0, 1).toUpperCase()}</span><CardArtwork className="room-deck-artwork" imageUrl={isHost ? selectedDeckImageUrl : null} name={`${hostDeck.name ?? "ホストのデッキ"}のアイコン`} sizes="62px" /><span><h2>{hostDeck.name ?? "ホストのデッキ"}</h2><p>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・40枚</p></span></div></article>
      <article className={isGuest ? "my-seat" : ""}><header><span>{isGuest ? "自分（02）" : "対戦相手（02）"}</span><strong className={room.guest_ready ? "ready" : "waiting"}>{room.guest_ready ? "準備完了" : "準備中"}</strong></header>{guestDeck ? <div><span aria-label={`${guestProfile?.display_name ?? "ゲスト"}のアカウントアイコン`} className={`room-player-avatar ${guestProfile?.avatar_url ? "has-image" : ""}`} style={guestProfile?.avatar_url ? { backgroundImage: `url("${guestProfile.avatar_url}")` } : undefined}>{guestProfile?.avatar_url ? null : (guestProfile?.display_name ?? (isGuest ? "自分" : "相手")).slice(0, 1).toUpperCase()}</span><CardArtwork className="room-deck-artwork" imageUrl={isGuest ? selectedDeckImageUrl : null} name={`${guestDeck.name ?? "ゲストのデッキ"}のアイコン`} sizes="62px" /><span><h2>{guestDeck.name ?? "ゲストのデッキ"}</h2><p>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・40枚</p></span></div> : <div className="room-seat-empty"><span aria-hidden="true" className="room-player-avatar">?</span><span><h2>参加者を待っています</h2><p>ルームIDを対戦相手へ共有してください。</p></span></div>}</article>
    </div>
    <div className={`room-status ${room.status}`}><span aria-hidden="true" className="room-status-indicator" /><strong>{room.status === "waiting" ? "対戦準備中" : room.status === "ready" ? "対戦を開始しています" : room.status === "playing" ? "対戦中" : "対戦終了"}</strong>{lobbyOpen ? <RoomWaitingRefresh /> : null}</div>
    {!isSpectator && lobbyOpen && selectedDeckId ? <form action={setRoomReadyAction} className="room-next-step"><input name="roomId" type="hidden" value={room.id} /><input name="ready" type="hidden" value={myReady ? "false" : "true"} />{myReady ? <input name="deckId" type="hidden" value={selectedDeckId} /> : null}<label><span>使用デッキ</span><select defaultValue={selectedDeckId} disabled={myReady} name="deckId" required>{playableDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><button className={myReady ? "secondary-button" : "button"} type="submit">{myReady ? "準備完了を取り消す" : "準備完了"}</button><p>対戦者2名が準備完了すると、自動的に対戦が始まります。</p></form> : null}
  </section>;
}
