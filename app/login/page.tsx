"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { uploadProfileIcon, validateAccountName } from "@/lib/profile-icon";
import { PasswordInput } from "@/components/password-input";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    const password = new FormData(event.currentTarget).get("password");
    const passwordConfirmation = new FormData(event.currentTarget).get("passwordConfirmation");
    const displayNameValue = new FormData(event.currentTarget).get("displayName");
    const iconValue = new FormData(event.currentTarget).get("profileIcon");
    if (typeof email !== "string" || !email.trim() || typeof password !== "string") return;
    if (password.length < 8) {
      setError(true);
      setMessage("パスワードは8文字以上で入力してください。");
      return;
    }
    if (mode === "register" && password !== passwordConfirmation) {
      setError(true);
      setMessage("確認用パスワードが一致しません。");
      return;
    }
    const displayName = mode === "register" && typeof displayNameValue === "string" ? validateAccountName(displayNameValue) : null;
    if (mode === "register" && !displayName) {
      setError(true);
      setMessage("アカウント名は1〜30文字で入力してください。");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setError(false);
    try {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) throw new Error("configuration");
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/rooms";
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        window.location.assign(next);
        return;
      }
      const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName } } });
      if (authError) throw authError;
      if (data.user && data.user.identities?.length === 0) {
        setError(true);
        setMessage("このメールアドレスはすでに登録済みです。今回入力したパスワードには変更されていません。「ログイン」を選択してください。");
        return;
      }
      if (data.session) {
        if (data.user && iconValue instanceof File && iconValue.size > 0) await uploadProfileIcon(supabase, data.user.id, iconValue);
        window.location.assign(next);
        return;
      }
      setMessage("アカウントを作成しましたが、現在はメール確認が必須です。Supabaseでメール確認を無効にすると、そのままログインできます。");
    } catch (caught) {
      setError(true);
      const message = caught instanceof Error ? caught.message : "";
      setMessage(message.toLowerCase().includes("invalid login credentials")
        ? "メールアドレスまたはパスワードが正しくありません。"
        : message.toLowerCase().includes("already registered")
          ? "このメールアドレスは登録済みです。ログインを選択してください。"
          : "認証できませんでした。入力内容を確認して再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-wrap account-page">
      <p className="eyebrow">デッキ・オンライン対戦</p>
      <h1>{mode === "login" ? "ログイン" : "アカウント作成"}</h1>
      <p className="form-intro">メールアドレスとパスワードで直接ログインできます。</p>
      <div className="auth-mode-switch" role="tablist" aria-label="認証方法">
        <button aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(null); }} role="tab" type="button">ログイン</button>
        <button aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setMessage(null); }} role="tab" type="button">新規登録</button>
      </div>
      <form onSubmit={submit}>
        {mode === "register" ? <><label>アカウント名<input autoComplete="nickname" maxLength={30} minLength={1} name="displayName" required type="text" /></label><label>アイコン<input accept="image/*" name="profileIcon" type="file" /><small className="form-help">中央を正方形に切り抜き、128×128pxのWebPへ圧縮します。</small></label></> : null}
        <label>
          メールアドレス
          <input autoComplete="email" name="email" required type="email" />
        </label>
        <div className="password-field">
          <label htmlFor="authPassword">パスワード</label>
          <PasswordInput autoComplete={mode === "login" ? "current-password" : "new-password"} id="authPassword" minLength={8} name="password" required />
          <small className="form-help">8文字以上</small>
        </div>
        {mode === "register" ? <div className="password-field">
          <label htmlFor="authPasswordConfirmation">パスワード（確認）</label>
          <PasswordInput autoComplete="new-password" id="authPasswordConfirmation" minLength={8} name="passwordConfirmation" required />
        </div> : null}
        {message ? <p className={`notice ${error ? "error" : "success"}`} role="status">{message}</p> : null}
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "処理中…" : mode === "login" ? "ログイン" : "アカウントを作成"}
        </button>
      </form>
      <Link href="/">相場チェッカーへ戻る</Link>
    </section>
  );
}
