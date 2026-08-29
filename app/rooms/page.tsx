import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { createRoomAction, joinRoomAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string }>;

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const { error: message } = await searchParams;
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/rooms");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login?next=/rooms");

  const [{ data: decks, error: decksError }, { data: rooms, error: roomsError }] = await Promise.all([
    supabase.from("decks").select("id, name, format, deck_cards(quantity, zone)").eq("owner_id", userId).order("updated_at", { ascending: false }),
    supabase.from("game_rooms").select("id, room_code, status, format, host_user_id, updated_at").order("updated_at", { ascending: false }).limit(12),
  ]);
  const playableDecks = (decks ?? []).filter((deck) =>
    deck.deck_cards.filter((card) => card.zone === "main").reduce((sum, card) => sum + card.quantity, 0) === 40,
  );

  return <section className="rooms-page">
    <div className="rooms-heading"><div><p className="eyebrow">オンライン対戦</p><h1>対戦ルーム</h1><p>40枚のデッキを固定して、ルームコードで対戦相手を招待します。</p></div><Link className="secondary-button" href="/decks">マイデッキへ</Link></div>
    {message ? <p className="notice error">{message}</p> : null}
    {decksError || roomsError ? <p className="notice error">データを読み込めませんでした。</p> : null}
    {playableDecks.length === 0 ? <div className="history-empty"><strong>対戦に使えるデッキがありません</strong><p>メインデッキを40枚ちょうどにして保存してください。</p><Link className="button" href="/decks/new">デッキを作る</Link></div> : <div className="room-form-grid">
      <form action={createRoomAction}><h2>ルームを作る</h2><p>あなたがホストになります。</p><label>使用するデッキ<select name="deckId" required>{playableDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}（{deck.format === "advanced" ? "アドバンス" : "オリジナル"}）</option>)}</select></label><button className="button" type="submit">ルームを作成</button></form>
      <form action={joinRoomAction}><h2>コードで参加</h2><p>ホストから受け取った6桁コードを入力します。</p><label>ルームコード<input autoCapitalize="characters" autoComplete="off" inputMode="text" maxLength={6} minLength={6} name="roomCode" pattern="[A-Fa-f0-9]{6}" placeholder="A1B2C3" required /></label><label>使用するデッキ<select name="deckId" required>{playableDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}（{deck.format === "advanced" ? "アドバンス" : "オリジナル"}）</option>)}</select></label><button className="button" type="submit">参加する</button></form>
    </div>}
    <section className="recent-rooms"><h2>最近のルーム</h2>{rooms?.length ? <div className="room-list">{rooms.map((room) => <Link href={`/rooms/${room.id}`} key={room.id}><strong>{room.room_code}</strong><span>{room.format === "advanced" ? "アドバンス" : "オリジナル"}・{room.status === "waiting" ? "相手を待っています" : room.status === "ready" ? "対戦準備完了" : "進行中または終了"}</span><small>{room.host_user_id === userId ? "ホスト" : "ゲスト"}</small></Link>)}</div> : <p className="notice">参加中のルームはありません。</p>}</section>
  </section>;
}
