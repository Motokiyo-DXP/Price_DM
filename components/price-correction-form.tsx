"use client";

import { useState } from "react";
import type { Database } from "@/lib/database.types";

type StockStatus = Database["public"]["Enums"]["stock_status"];
type Feedback = { status: "success" | "error"; message: string };

type PriceCorrectionRecord = {
  id: string;
  salePrice: number | null;
  buyPrice: number | null;
  stockStatus: StockStatus;
  observedOn: string;
  note?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  already_pending: "この記録には確認待ちの修正申請があります。管理者の確認をお待ちください。",
  invalid_request: "入力内容を確認してください。販売価格または買取価格の入力が必要です。",
  price_record_unavailable: "この価格記録は修正できません。画面を更新して状態を確認してください。",
  service_unavailable: "現在、修正申請を受け付けられません。時間をおいて再度お試しください。",
  session_required: "登録PINの認証期限が切れています。価格登録画面でPINを再認証してください。",
  submission_failed: "申請を送信できませんでした。入力内容を確認して再度お試しください。",
};

async function errorMessage(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  const error =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error
      : "";

  return ERROR_MESSAGES[error] ?? ERROR_MESSAGES.submission_failed;
}

export function PriceCorrectionForm({
  record,
}: {
  record: PriceCorrectionRecord;
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/price-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceRecordId: Number(record.id),
          salePrice:
            formData.get("salePrice") === ""
              ? null
              : Number(formData.get("salePrice")),
          buyPrice:
            formData.get("buyPrice") === ""
              ? null
              : Number(formData.get("buyPrice")),
          stockStatus: formData.get("stockStatus"),
          observedOn: formData.get("observedOn"),
          note: formData.get("note"),
          reason: formData.get("reason"),
        }),
      });

      if (!response.ok) {
        setFeedback({ status: "error", message: await errorMessage(response) });
        return;
      }

      setSubmitted(true);
      setFeedback({
        status: "success",
        message: "修正申請を送信しました。管理者の確認をお待ちください。",
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
    <details className="correction-request">
      <summary>この記録の修正を申請</summary>
      <form action={submit} aria-busy={pending}>
        <label>
          販売価格
          <input
            name="salePrice"
            type="number"
            min="0"
            defaultValue={record.salePrice ?? ""}
          />
        </label>
        <label>
          買取価格
          <input
            name="buyPrice"
            type="number"
            min="0"
            defaultValue={record.buyPrice ?? ""}
          />
        </label>
        <label>
          確認日
          <input
            name="observedOn"
            type="date"
            defaultValue={record.observedOn}
            required
          />
        </label>
        <label>
          在庫
          <select name="stockStatus" defaultValue={record.stockStatus}>
            <option value="in_stock">在庫あり</option>
            <option value="low_stock">残りわずか</option>
            <option value="out_of_stock">在庫なし</option>
            <option value="unknown">不明</option>
            <option value="buying">買取中</option>
            <option value="buying_paused">買取停止</option>
          </select>
        </label>
        <label>
          メモ
          <textarea
            name="note"
            defaultValue={record.note ?? ""}
            maxLength={2000}
          />
        </label>
        <label>
          修正理由
          <textarea name="reason" required maxLength={2000} />
        </label>
        <button
          className="secondary-button"
          disabled={pending || submitted}
          type="submit"
        >
          {pending ? "送信中…" : submitted ? "申請済み" : "修正を申請"}
        </button>
        {feedback && (
          <p
            className={`notice ${feedback.status}`}
            role={feedback.status === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
      </form>
    </details>
  );
}
