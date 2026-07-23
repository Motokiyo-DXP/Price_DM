"use client";

import { type FormEvent, useState } from "react";
import { adminLoginErrorMessage } from "@/lib/admin-login-feedback";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type LoginNotice = {
  status: "success" | "error";
  message: string;
};

export default function AdminLoginPage() {
  const [notice, setNotice] = useState<LoginNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    if (typeof email !== "string" || !email.trim()) return;

    setNotice(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setNotice({ status: "error", message: "接続設定を確認してください。" });
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setNotice({ status: "error", message: adminLoginErrorMessage(error) });
        return;
      }

      setNotice({
        status: "success",
        message:
          "利用を許可されたアカウントには、ログイン用メールを送信しました。受信箱を確認してください。",
      });
    } catch (error) {
      setNotice({ status: "error", message: adminLoginErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
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
        {notice ? (
          <p className={`notice ${notice.status}`} role="status">
            {notice.message}
          </p>
        ) : null}
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "送信中…" : "ログイン用メールを送る"}
        </button>
      </form>
    </section>
  );
}
