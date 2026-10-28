"use client";

import { useRef, useState } from "react";
import { getOrCreateDeckShareTokenAction } from "@/app/decks/actions";

export function DeckShareButton({ deckId, visibility, disabled, onPublished, onPendingChange }: {
  deckId: string;
  visibility: string;
  disabled: boolean;
  onPublished: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function share(publish: boolean) {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    onPendingChange(true);
    setDone(false);
    setError("");
    try {
      const result = await getOrCreateDeckShareTokenAction(deckId, publish);
      if (result.status === "confirmation-required") {
        dialog.current?.showModal();
        return;
      }
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onPublished();
      dialog.current?.close();
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/deck-search?share=${result.token}`);
        setDone(true);
      } catch {
        setError("デッキは公開されていますが、URLをコピーできませんでした。もう一度「デッキを共有」を押してください。");
      }
    } catch {
      setError("共有処理を完了できませんでした。もう一度お試しください。");
    } finally {
      busy.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }

  return <>
    <button className="deck-share-button" disabled={pending || disabled} onClick={() => {
      setDone(false);
      setError("");
      if (visibility !== "public") dialog.current?.showModal();
      else void share(false);
    }} type="button">⌯　{pending ? "共有中…" : done ? "URLをコピーしました" : "デッキを共有"}</button>
    <dialog className="deck-share-confirm" aria-labelledby={`publish-deck-${deckId}`} onCancel={event => { if (pending) event.preventDefault(); }} ref={dialog}>
      <p id={`publish-deck-${deckId}`}>このデッキを公開に変更して良いですか？</p>
      <p>公開すると、デッキ検索に表示され、SNSでもデッキ名・カード画像が表示されます。</p>
      <button disabled={pending} onClick={() => void share(true)} type="button">YES</button>
      <button autoFocus disabled={pending} onClick={() => dialog.current?.close()} type="button">NO</button>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </dialog>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
  </>;
}
