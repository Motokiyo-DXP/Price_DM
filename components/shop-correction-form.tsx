"use client";

import { useState } from "react";
import { JAPAN_PREFECTURES } from "@/lib/prefectures";
import type { RegistrationShopOption } from "@/lib/registration-lookup-mapping";

type Feedback = { status: "success" | "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  already_pending: "この店舗には確認待ちの修正依頼があります。管理者の確認をお待ちください。",
  invalid_prefecture: "都道府県を選び直してください。",
  invalid_request: "入力内容と修正理由を確認してください。",
  invalid_website_url: "公式サイトURLは http:// または https:// から入力してください。",
  no_changes: "修正したい項目を1つ以上入力してください。",
  service_unavailable: "現在、修正依頼を受け付けられません。時間をおいて再度お試しください。",
  session_required: "依頼にはログインが必要です。ログイン後に再度お試しください。",
  shop_unavailable: "この店舗は現在修正できません。画面を更新して確認してください。",
  submission_failed: "修正依頼を送信できませんでした。入力内容を確認して再度お試しください。",
  too_long: "入力内容が長すぎます。文字数を減らしてください。",
};

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  const code =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error
      : "submission_failed";
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.submission_failed;
}

export function ShopCorrectionForm({ shop }: { shop: RegistrationShopOption }) {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setFeedback(null);
    try {
      const session = await fetch("/api/registration-session", { cache: "no-store" });
      if (!session.ok) {
        setFeedback({ status: "error", message: ERROR_MESSAGES.session_required });
        return;
      }
      const aliases = String(formData.get("aliases") ?? "")
        .split(/[\n,]/)
        .map((alias) => alias.trim())
        .filter(Boolean);
      const response = await fetch("/api/shop-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: shop.id,
          name: formData.get("name"),
          nameKana: formData.get("nameKana"),
          aliases,
          prefecture: formData.get("prefecture"),
          municipality: formData.get("municipality"),
          addressLine: formData.get("addressLine"),
          websiteUrl: formData.get("websiteUrl"),
          reason: formData.get("reason"),
        }),
      });
      if (!response.ok) {
        setFeedback({ status: "error", message: await responseError(response) });
        return;
      }
      setSubmitted(true);
      setFeedback({
        status: "success",
        message: "店舗情報の修正依頼を送信しました。管理者の確認をお待ちください。",
      });
    } catch {
      setFeedback({
        status: "error",
        message: "通信に失敗しました。接続を確認して再度お試しください。",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="shop-candidate-panel correction-request">
      <summary>選択した店舗の情報修正を依頼</summary>
      <p className="form-help">
        対象: <strong>{shop.name}</strong>。変更したい項目だけを入力してください。
      </p>
      <form action={submit} aria-busy={pending}>
        <label>
          修正後の店舗名
          <input name="name" maxLength={200} placeholder={shop.name} />
        </label>
        <label>
          店舗名の読み
          <input name="nameKana" maxLength={200} placeholder="例: かーどしょっぷ" />
        </label>
        <label>
          別名
          <textarea name="aliases" rows={2} maxLength={4019} placeholder="改行またはカンマ区切り（最大20件）" />
        </label>
        <div className="two">
          <label>
            都道府県
            <select name="prefecture" defaultValue="">
              <option value="">変更しない（現在: {shop.prefecture || "未設定"}）</option>
              {JAPAN_PREFECTURES.map((prefecture) => (
                <option key={prefecture} value={prefecture}>{prefecture}</option>
              ))}
            </select>
          </label>
          <label>
            市区町村
            <input name="municipality" maxLength={100} placeholder={shop.municipality || "例: 横浜市西区"} />
          </label>
        </div>
        <label>
          住所（市区町村より後）
          <input name="addressLine" maxLength={300} placeholder="例: 南幸1-2-3 ○○ビル4F" />
        </label>
        <label>
          公式サイト・公式SNS URL
          <input name="websiteUrl" type="url" maxLength={500} placeholder="https://example.com/shop" />
        </label>
        <label>
          修正理由
          <textarea name="reason" rows={3} maxLength={2000} required />
        </label>
        <button className="secondary-button" type="submit" disabled={pending || submitted}>
          {pending ? "送信中…" : submitted ? "依頼済み" : "店舗情報の修正を依頼"}
        </button>
        {feedback && (
          <p className={`notice ${feedback.status}`} role={feedback.status === "error" ? "alert" : "status"}>
            {feedback.message}
          </p>
        )}
      </form>
    </details>
  );
}
