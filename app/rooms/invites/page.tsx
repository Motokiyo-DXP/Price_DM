import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { acceptOnlineLobbyInvitationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function OnlineInvitesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/rooms/invites");
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login?next=/rooms/invites");
  const { data: invitations } = await supabase.from("online_lobby_invitations").select("id, lobby_id, created_at").eq("invitee_user_id", userId).is("accepted_at", null).is("dismissed_at", null).order("created_at", { ascending: false });
  return <section className="online-invites-page"><header><Link href="/rooms">←</Link><div><p>INVITATIONS</p><h1>招待通知箱</h1></div></header>{error ? <p className="notice error">{error}</p> : null}{invitations?.length ? <div className="online-invite-list">{invitations.map((invite) => <form action={acceptOnlineLobbyInvitationAction} key={invite.id}><input name="invitationId" type="hidden" value={invite.id} /><button type="submit"><span>ルームへの招待</span><strong>通知をタップして参加</strong><small>{new Date(invite.created_at).toLocaleString("ja-JP")}</small></button></form>)}</div> : <div className="history-empty"><strong>新しい招待はありません</strong><p>フレンドから招待が届くとここに表示されます。</p></div>}</section>;
}
