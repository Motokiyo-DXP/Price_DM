"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Friend = { friend_user_id: string; display_name: string };
type Incoming = { share_id: string; display_name: string };
export function ShoppingListSharing() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [readers, setReaders] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");
  const load = useCallback(async () => {
    const db = createBrowserSupabaseClient();
    if (!db) { setMessage("共有設定に接続できません。"); return; }
    try {
      const [friendResult, settings, shared] = await Promise.all([
        db.rpc("list_my_friends"), db.rpc("shopping_share_settings"), db.rpc("shared_shopping_lists"),
      ]);
      if (friendResult.error || settings.error || shared.error) throw new Error();
      const value = settings.data as { token: string | null; readers: string[] };
      setFriends(friendResult.data ?? []); setIncoming(shared.data ?? []);
      setReaders(value.readers); setToken(value.token); setReady(true);
    } catch { setReady(false); setMessage("共有設定を読み込めませんでした。再読み込みしてください。"); }
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 10_000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(timer); };
  }, [load]);
  const changeFriend = async (id: string, enabled: boolean) => {
    const db = createBrowserSupabaseClient();
    if (!db || busy) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await db.rpc("set_shopping_friend", { p_reader: id, p_enabled: enabled });
      if (error) throw error;
      await load();
    } catch { setMessage("フレンドへの共有を変更できませんでした。"); }
    finally { setBusy(false); }
  };
  const changeUrl = async (enabled: boolean) => {
    const db = createBrowserSupabaseClient();
    if (!db || busy) return;
    setBusy(true); setMessage("");
    try {
      const { data, error } = await db.rpc("set_shopping_url", { p_enabled: enabled });
      if (error) throw error;
      setToken(data); setMessage(enabled ? "共有URLを発行しました。リンクを知っている人はログインせず閲覧できます。" : "URL共有を停止しました。以前のURLは無効です。");
    } catch { setMessage("URL共有を変更できませんでした。"); }
    finally { setBusy(false); }
  };
  const url = token ? `${origin}/shopping-list/shared/${token}` : "";
  return <section className="shopping-sharing" aria-label="買い物リストの共有">
    <details><summary>共有</summary>
      <h2>フレンドへの共有設定</h2>
      <p>選択したフレンドだけが閲覧できます。追加・削除は所有者のみ行えます。</p>
      {ready && !friends.length && <p>登録済みのフレンドはいません。</p>}
      {friends.map((friend) => <label key={friend.friend_user_id}>
        <input type="checkbox" disabled={!ready || busy} checked={readers.includes(friend.friend_user_id)} onChange={(event) => void changeFriend(friend.friend_user_id, event.target.checked)} />
        {friend.display_name}<span>{readers.includes(friend.friend_user_id) ? "共有中（選択を外すと解除）" : "非公開"}</span>
      </label>)}
      <h2>URLで共有：{token ? "有効" : "無効"}</h2>
      <p>リンクを知っている人が閲覧できます。再度有効にすると新しいURLを発行します。</p>
      <button type="button" disabled={!ready || busy} onClick={() => void changeUrl(!token)}>{token ? "URL共有を停止" : "URLで共有を有効にする"}</button>
      {token && <div className="shopping-share-url"><input readOnly aria-label="共有URL" value={url} /><button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage("共有URLをコピーしました。"), () => setMessage("コピーできませんでした。共有URLを選択してコピーしてください。"))}>URLをコピー</button></div>}
    </details>
    {message && <p role="status">{message}</p>}
    {!!incoming.length && <nav aria-label="フレンドから共有された買い物リスト"><h2>共有されたリスト</h2>{incoming.map((list) => <Link key={list.share_id} href={`/shopping-list/friends/${list.share_id}`}>{list.display_name}の買い物リスト</Link>)}</nav>}
  </section>;
}
