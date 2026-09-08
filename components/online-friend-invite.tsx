"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { sendOnlineLobbyFriendInvitationAction } from "@/app/rooms/actions";
import { OnlineDismissibleLayer } from "@/components/online-dialog";

export type InvitableFriend = {
  friend_user_id: string;
  display_name: string;
  invitation_status: string;
  is_online: boolean;
};

function InviteSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} type="submit">{pending ? "送信中…" : "招待"}</button>;
}

export function OnlineFriendInvite({ friends, lobbyId }: { friends: InvitableFriend[]; lobbyId: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="online-friend-invite-trigger" onClick={() => setOpen(true)} type="button">フレンドを招待</button>
    {open ? <OnlineDismissibleLayer onDismiss={() => setOpen(false)}>
      <section aria-label="招待するフレンドを選択" aria-modal="true" className="online-friend-invite-dialog" role="dialog">
        <header><div><p>FRIEND INVITE</p><h2>フレンドを選択</h2></div><button aria-label="閉じる" onClick={() => setOpen(false)} type="button">×</button></header>
        {friends.length ? <div className="online-friend-list">{friends.map((friend) => {
          const unavailable = friend.invitation_status !== "available";
          const status = friend.invitation_status === "in_lobby" ? "参加中" : friend.invitation_status === "invited" ? "送信済み" : friend.is_online ? "オンライン" : "オフライン";
          return <form action={sendOnlineLobbyFriendInvitationAction} key={friend.friend_user_id}>
            <input name="lobbyId" type="hidden" value={lobbyId} />
            <input name="friendUserId" type="hidden" value={friend.friend_user_id} />
            <span className="member-avatar">{friend.display_name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{friend.display_name}</strong><small>{status}</small></span>
            <InviteSubmitButton disabled={unavailable} />
          </form>;
        })}</div> : <div className="online-friend-empty"><strong>招待できるフレンドがいません</strong><p>フレンド登録が完了すると、ここから選択できます。</p></div>}
        <button className="secondary-button" onClick={() => setOpen(false)} type="button">閉じる</button>
      </section>
    </OnlineDismissibleLayer> : null}
  </>;
}
