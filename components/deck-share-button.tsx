"use client";

import { useRef, useState } from "react";
import { getOrCreateDeckShareTokenAction } from "@/app/decks/actions";

export function DeckShareButton({ deckId, disabled, onPublished, onPendingChange }: {
  deckId: string;
  disabled: boolean;
  onPublished: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function share() {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    onPendingChange(true);
    setDone(false);
    setError("");
    try {
      const result = await getOrCreateDeckShareTokenAction(deckId);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onPublished();
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
    <button className="deck-share-button" disabled={pending || disabled} onClick={() => void share()} type="button">⌯　{pending ? "共有中…" : done ? "URLをコピーしました" : "デッキを共有"}</button>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
  </>;
}
