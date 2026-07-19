"use client";

import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function AdminLoginPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    if (typeof email !== "string" || !email.trim()) return;

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    }
    setSubmitting(false);
    setNotice("利用を許可されたアカウントには、ログイン用メールを送信しました。受信箱を確認してください。");
  }

  return (
    <section className="form-wrap">
      <p className="eyebrow">管理者専用</p>
      <h1>店舗候補を確認</h1>
      <p className="form-intro">許可済みの管理者アカウントでログインしてください。</p>
      <form onSubmit={submit}>
        <label>
          メールアドレス
          <input autoComplete="email" name="email" required type="email" />
        </label>
        {notice ? <p className="notice success">{notice}</p> : null}
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "送信中…" : "ログイン用メールを送る"}
        </button>
      </form>
    </section>
  );
}
