import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import {
  createOnlineLobbyAction,
  joinOnlineLobbyByCodeAction,
  openPublicLobbyAction,
} from "./actions";
import { OnlineRouteDialog } from "@/components/online-dialog";

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
  const [{ count: inviteCount }, { data: activeMatches }, { data: readyRooms }] = await Promise.all([
    supabase.from("online_lobby_invitations").select("id", { count: "exact", head: true }).eq("invitee_user_id", userId).is("accepted_at", null).is("dismissed_at", null),
    supabase.from("game_rooms").select("id").eq("status", "playing").or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`).order("updated_at", { ascending: false }).limit(1),
    supabase.from("game_rooms").select("id").in("status", ["waiting", "ready"]).gt("expires_at", new Date().toISOString()).or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`).order("updated_at", { ascending: false }).limit(1),
  ]);

  return <section className="online-entry-page">
    <header className="online-entry-heading">
      <div className="primary-page-title"><h1>オンライン</h1><div className="directory-accent" aria-hidden="true" /></div>
      <span className="online-entry-status"><i aria-hidden="true" />オンライン中</span>
    </header>
    {error ? <p className="notice error">{error}</p> : null}
    <div className="online-entry-content">
      <div className="online-entry-menu">
        <form action={openPublicLobbyAction}><button className="online-entry-button public" type="submit"><span aria-hidden="true" className="online-entry-symbol public-room-icon" /><strong>公開ルームへ参加</strong><small>誰でも参加・10受付</small><b aria-hidden="true">›</b></button></form>
        <form action={createOnlineLobbyAction}><button className="online-entry-button create" type="submit"><span aria-hidden="true" className="online-entry-symbol">＋</span><strong>ルームを作る</strong><small>4つのマッチ受付</small><b aria-hidden="true">›</b></button></form>
        <Link className="online-entry-button room-id" href="/rooms?dialog=room-id"><span aria-hidden="true" className="online-entry-symbol">⌕</span><strong>ルームIDで参加</strong><small>ルームIDを入力</small><b aria-hidden="true">›</b></Link>
        <Link className="online-entry-button invites" href="/rooms/invites"><span aria-hidden="true" className="online-entry-symbol online-entry-invitation-icon" /><strong>招待を受ける</strong><small>招待されたルーム</small>{inviteCount ? <em aria-label={`${inviteCount}件の招待`}>{inviteCount}</em> : null}<b aria-hidden="true">›</b></Link>
      </div>
      <Link className="online-friends-link" href="/friends"><span aria-hidden="true" className="ui-icon ui-icon-team" /><strong>フレンドを探す・フレンド一覧</strong><b aria-hidden="true">›</b></Link>
      {activeMatches?.[0] ? <Link className="online-friends-link online-return-link" href={`/rooms/${activeMatches[0].id}/battle`}><span aria-hidden="true" className="online-return-icon">↩</span><span><strong>対戦に戻る</strong><small>進行中の対戦があります</small></span><b aria-hidden="true">›</b></Link> : null}
      {!activeMatches?.[0] && readyRooms?.[0] ? <Link className="online-friends-link online-return-link" href={`/rooms/${readyRooms[0].id}`}><span aria-hidden="true" className="online-return-icon">↩</span><span><strong>ルームに戻る</strong><small>対戦準備中のルームがあります</small></span><b aria-hidden="true">›</b></Link> : null}
    </div>
    {dialog === "room-id" ? <OnlineRouteDialog dismissHref="/rooms"><form action={joinOnlineLobbyByCodeAction} className="online-dialog"><div className="online-dialog-title"><div><p>ルームIDで参加</p><h2>ルームIDを入力</h2></div><Link aria-label="閉じる" href="/rooms">×</Link></div><label>ルームID<input autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} name="joinCode" pattern="[A-Fa-f0-9]{6}" placeholder="A1B2C3" required /></label><button className="button" type="submit">ルームへ入る</button></form></OnlineRouteDialog> : null}
  </section>;
}
