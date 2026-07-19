"use client";

import { useState } from "react";
import type { Database } from "@/lib/database.types";

type StockStatus = Database["public"]["Enums"]["stock_status"];

export function PriceCorrectionForm({
  record,
}: {
  record: { id: string; salePrice: number | null; buyPrice: number | null; stockStatus: StockStatus; observedOn: string; note?: string };
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true); setMessage("");
    const response = await fetch("/api/price-corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      priceRecordId: Number(record.id), salePrice: formData.get("salePrice") === "" ? null : Number(formData.get("salePrice")), buyPrice: formData.get("buyPrice") === "" ? null : Number(formData.get("buyPrice")), stockStatus: formData.get("stockStatus"), observedOn: formData.get("observedOn"), note: formData.get("note"), reason: formData.get("reason"),
    }) });
    setPending(false); setMessage(response.ok ? "修正申請を送信しました。管理者の確認をお待ちください。" : "申請を送信できませんでした。PIN認証と入力内容を確認してください。");
  }
  return <details className="correction-request"><summary>この記録の修正を申請</summary><form action={submit}>
    <label>販売価格<input name="salePrice" type="number" min="0" defaultValue={record.salePrice ?? ""} /></label>
    <label>買取価格<input name="buyPrice" type="number" min="0" defaultValue={record.buyPrice ?? ""} /></label>
    <label>確認日<input name="observedOn" type="date" defaultValue={record.observedOn} required /></label>
    <label>在庫<select name="stockStatus" defaultValue={record.stockStatus}><option value="in_stock">在庫あり</option><option value="low_stock">残りわずか</option><option value="out_of_stock">在庫なし</option><option value="unknown">不明</option><option value="buying">買取中</option><option value="buying_paused">買取停止</option></select></label>
    <label>メモ<textarea name="note" defaultValue={record.note ?? ""} maxLength={2000} /></label>
    <label>修正理由<textarea name="reason" required maxLength={2000} /></label>
    <button className="secondary-button" disabled={pending} type="submit">{pending ? "送信中…" : "修正を申請"}</button>
    {message && <p className="notice">{message}</p>}
  </form></details>;
}
