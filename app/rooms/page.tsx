import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import {
  createOnlineLobbyAction,
  joinOnlineLobbyWithPassphraseAction,
  openPublicLobbyAction,
} from "./actions";
import { OnlineRouteDialog } from "@/components/online-dialog";
import { PasswordInput } from "@/components/password-input";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ dialog?: string; error?: string }>;

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const { dialog, error } = await searchParams;
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/rooms");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login?next=/rooms");
  // Apply retention on entry as a recoverable soft retirement. The same
  // worker can later be scheduled without changing room semantics.
  await supabase.rpc("retire_stale_game_rooms");
  const [{ count: inviteCount }, { data: resumableRooms }] = await Promise.all([
    supabase.from("online_lobby_invitations").select("id", { count: "exact", head: true }).eq("invitee_user_id", userId).is("accepted_at", null).is("dismissed_at", null),
    supabase.rpc("list_resumable_game_rooms"),
  ]);

  return <section className="online-entry-page">
    <header className="online-entry-heading"><Link aria-label="戻る" href="/">←</Link><div><p>ONLINE BATTLE</p><h1>オンライン対戦</h1></div></header>
    {error ? <p className="notice error">{error}</p> : null}
    {resumableRooms?.length ? <section className="resumable-rooms"><div><p>RECONNECT</p><h2>参加中の対戦へ戻る</h2></div><div>{resumableRooms.map((room) => <Link href={room.status === "playing" || room.status === "finished" ? `/rooms/${room.id}/battle` : `/rooms/${room.id}`} key={room.id}><strong>{room.room_code}</strong><span>{room.status === "playing" ? "対戦中" : room.status === "ready" ? "開始待ち" : "準備中"}</span><small>{room.member_role === "host" ? "ホスト" : room.member_role === "guest" ? "ゲスト" : "観戦者"}・{room.format === "advanced" ? "アドバンス" : "オリジナル"}</small></Link>)}</div></section> : null}
    <div className="online-entry-menu">
      <form action={createOnlineLobbyAction}><button className="online-entry-button create" type="submit"><span>A</span><strong>ルームを作る</strong><small>4つのマッチ受付</small></button></form>
      <form action={openPublicLobbyAction}><button className="online-entry-button public" type="submit"><span>B</span><strong>公開ルームへ参加</strong><small>誰でも参加・10受付</small></button></form>
      <Link className="online-entry-button passphrase" href="/rooms?dialog=passphrase"><span>C</span><strong>合言葉で参加</strong><small>ルームIDと合言葉を入力</small></Link>
      <Link className="online-entry-button invites" href="/rooms/invites"><span>D</span><strong>招待を受ける</strong><small>招待通知箱{inviteCount ? `（${inviteCount}件）` : ""}</small></Link>
    </div>
    {dialog === "passphrase" ? <OnlineRouteDialog dismissHref="/rooms"><form action={joinOnlineLobbyWithPassphraseAction} className="online-dialog"><div className="online-dialog-title"><div><p>合言葉で参加</p><h2>ルーム情報を入力</h2></div><Link aria-label="閉じる" href="/rooms">×</Link></div><label>ルームID<input autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} name="joinCode" pattern="[A-Fa-f0-9]{6}" placeholder="A1B2C3" required /></label><div className="password-field"><label htmlFor="roomPassphrase">合言葉</label><PasswordInput autoComplete="off" id="roomPassphrase" maxLength={32} minLength={4} name="passphrase" placeholder="4〜32文字" required /></div><button className="button" type="submit">ルームへ入る</button></form></OnlineRouteDialog> : null}
  </section>;
}
