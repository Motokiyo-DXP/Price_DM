import { redirect } from "next/navigation";
import { FriendPageClient, type FriendSummary, type IncomingFriendRequest } from "@/components/friend-page-client";
import { formatFriendCode } from "@/lib/friend-code";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export default async function FriendsPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/friends");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/login?next=/friends");

  const [codeResult, friendsResult, requestsResult] = await Promise.all([
    supabase.rpc("get_my_friend_code"),
    supabase.rpc("list_my_friends"),
    supabase.rpc("list_incoming_friend_requests"),
  ]);
  const loadError = codeResult.error ?? friendsResult.error ?? requestsResult.error;

  return <section className="friend-page">
    <div className="friend-page-title"><p className="eyebrow">FRIEND</p><h1>フレンド</h1><p>フレンドコードでつながり、オンライン対戦へ招待できます。</p></div>
    {loadError || !codeResult.data ? <p className="notice error">フレンド情報を読み込めませんでした。時間をおいて再度お試しください。</p> : <>
      <section className="friend-code-panel" aria-labelledby="my-friend-code-heading">
        <div><p className="eyebrow">MY CODE</p><h2 id="my-friend-code-heading">自分のフレンドコード</h2><small>このコードは変更されません。申請してもらう相手に共有してください。</small></div>
        <strong>{formatFriendCode(codeResult.data)}</strong>
      </section>
      <FriendPageClient friends={(friendsResult.data ?? []) as FriendSummary[]} incomingRequests={(requestsResult.data ?? []) as IncomingFriendRequest[]} />
    </>}
  </section>;
}
