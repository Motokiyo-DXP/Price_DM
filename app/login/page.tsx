"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    if (typeof email !== "string" || !email.trim()) return;
    setSubmitting(true);
    setMessage(null);
    setError(false);
    try {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) throw new Error("configuration");
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/decks";
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) throw authError;
      setMessage("ログイン用メールを送信しました。受信箱を確認してください。");
    } catch {
      setError(true);
      setMessage("メールを送信できませんでした。しばらくしてから再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-wrap account-page">
      <p className="eyebrow">デッキ機能</p>
      <h1>ログイン・新規登録</h1>
      <p className="form-intro">メールに届くリンクから安全にログインできます。</p>
      <form onSubmit={submit}>
        <label>
          メールアドレス
          <input autoComplete="email" name="email" required type="email" />
        </label>
        {message ? <p className={`notice ${error ? "error" : "success"}`} role="status">{message}</p> : null}
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "送信中…" : "ログイン用メールを送る"}
        </button>
      </form>
      <Link href="/">相場チェッカーへ戻る</Link>
    </section>
  );
}
