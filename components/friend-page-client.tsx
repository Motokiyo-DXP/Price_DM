"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { respondFriendRequestAction, sendFriendRequestAction } from "@/app/friends/actions";
import { initialFriendActionState } from "@/app/friends/action-state";

export type FriendSummary = {
  friend_user_id: string;
  display_name: string;
  avatar_url: string | null;
  friends_since: string;
};

export type IncomingFriendRequest = {
  requester_user_id: string;
  display_name: string;
  avatar_url: string | null;
  requested_at: string;
};

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  return avatarUrl
    ? <span aria-hidden="true" className="friend-avatar has-image" style={{ backgroundImage: `url("${avatarUrl}")` }} />
    : <span aria-hidden="true" className="friend-avatar">{displayName.slice(0, 1).toUpperCase()}</span>;
}

function SendFriendRequestForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(sendFriendRequestAction, initialFriendActionState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.status]);

  return <form action={formAction} className="friend-request-form" ref={formRef}>
    <label htmlFor="friend-code">フレンドコード</label>
    <div>
      <input autoComplete="off" id="friend-code" inputMode="numeric" maxLength={9} name="friendCode" pattern="[0-9]{4}-?[0-9]{4}" placeholder="0000-0000" required />
      <button className="button" disabled={pending} type="submit">{pending ? "送信中…" : "申請する"}</button>
    </div>
    <small>相手の8桁のコードを入力してください。ハイフンは省略できます。</small>
    {state.status !== "idle" ? <p className={`notice ${state.status}`} role="status">{state.message}</p> : null}
  </form>;
}

function IncomingRequestCard({ request }: { request: IncomingFriendRequest }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(respondFriendRequestAction, initialFriendActionState);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return <article className="friend-row">
    <Avatar avatarUrl={request.avatar_url} displayName={request.display_name} />
    <div><strong>{request.display_name}</strong><small>フレンド申請が届いています</small></div>
    <form action={formAction}>
      <input name="requesterUserId" type="hidden" value={request.requester_user_id} />
      <button className="button compact" disabled={pending} name="decision" value="accept">承認</button>
      <button className="secondary-button compact" disabled={pending} name="decision" value="decline">見送る</button>
    </form>
    {state.status !== "idle" ? <p className={`notice ${state.status}`} role="status">{state.message}</p> : null}
  </article>;
}

export function FriendPageClient({ friends, incomingRequests }: { friends: FriendSummary[]; incomingRequests: IncomingFriendRequest[] }) {
  return <>
    <section className="friend-panel" aria-labelledby="friend-request-heading">
      <div><p className="eyebrow">ADD FRIEND</p><h2 id="friend-request-heading">フレンド申請</h2></div>
      <SendFriendRequestForm />
    </section>

    <section className="friend-panel" aria-labelledby="incoming-friends-heading">
      <div className="friend-panel-heading"><div><p className="eyebrow">REQUESTS</p><h2 id="incoming-friends-heading">自分へのフレンド申請</h2></div><span>{incomingRequests.length}件</span></div>
      {incomingRequests.length ? <div className="friend-rows">{incomingRequests.map((request) => <IncomingRequestCard key={request.requester_user_id} request={request} />)}</div> : <div className="friend-empty">届いている申請はありません。</div>}
    </section>

    <section className="friend-panel" aria-labelledby="friend-list-heading">
      <div className="friend-panel-heading"><div><p className="eyebrow">FRIENDS</p><h2 id="friend-list-heading">フレンドの一覧</h2></div><span>{friends.length}人</span></div>
      {friends.length ? <div className="friend-rows">{friends.map((friend) => <article className="friend-row" key={friend.friend_user_id}><Avatar avatarUrl={friend.avatar_url} displayName={friend.display_name} /><div><strong>{friend.display_name}</strong><small>フレンド</small></div></article>)}</div> : <div className="friend-empty">まだフレンドはいません。</div>}
    </section>
  </>;
}
