"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { uploadProfileIcon, validateAccountName } from "@/lib/profile-icon";
import { PasswordInput } from "@/components/password-input";

export function AccountSettings({ initialAvatarUrl, initialDisplayName, initialEmail, userId }: { initialAvatarUrl: string | null; initialDisplayName: string; initialEmail: string; userId: string }) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const name = validateAccountName(displayName);
      if (!name) throw new Error("アカウント名は1〜30文字で入力してください。");
      const supabase = createBrowserSupabaseClient();
      if (!supabase) throw new Error("認証設定を読み込めません");
      const file = new FormData(event.currentTarget).get("profileIcon");
      const { error } = await supabase.from("profiles").update({ display_name: name, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) throw error;
      if (file instanceof File && file.size > 0) setAvatarUrl(await uploadProfileIcon(supabase, userId, file));
      setDisplayName(name); setMessage("プロフィールを更新しました。");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "プロフィールを更新できませんでした。"); }
    finally { setBusy(false); }
  }
  async function updateEmail(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(null); const supabase = createBrowserSupabaseClient(); const { error } = supabase ? await supabase.auth.updateUser({ email }) : { error: new Error("認証設定を読み込めません") }; setMessage(error ? error.message : "確認メールを送信しました。"); setBusy(false); }
  async function updatePassword(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(null); const supabase = createBrowserSupabaseClient(); const { error } = supabase ? await supabase.auth.updateUser({ password }) : { error: new Error("認証設定を読み込めません") }; if (!error) setPassword(""); setMessage(error ? error.message : "パスワードを変更しました。"); setBusy(false); }
  return <div className="account-settings"><form onSubmit={updateProfile}><h2>対戦プロフィール</h2><div className="account-profile-preview">{avatarUrl ? <span className="profile-avatar" style={{ backgroundImage: `url("${avatarUrl}")` }} /> : <span className="profile-avatar fallback">{displayName.slice(0, 1).toUpperCase()}</span>}<strong>{displayName}</strong></div><label>アカウント名<input autoComplete="nickname" maxLength={30} onChange={(event) => setDisplayName(event.target.value)} required value={displayName}/></label><label>アイコン<input accept="image/*" name="profileIcon" type="file"/><small>中央を正方形に切り抜き、128×128pxのWebPへ圧縮します。</small></label><button className="button" disabled={busy} type="submit">プロフィールを保存</button></form><form onSubmit={updateEmail}><h2>メールアドレス</h2><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email}/><button className="button" disabled={busy || email === initialEmail} type="submit">メールアドレスを変更</button></form><form onSubmit={updatePassword}><h2>パスワード</h2><PasswordInput aria-label="新しいパスワード" autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="8文字以上" required value={password}/><button className="button" disabled={busy || password.length < 8} type="submit">パスワードを変更</button></form>{message ? <p className="notice">{message}</p> : null}</div>;
}
