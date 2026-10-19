"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { CardArtwork } from "@/components/card-artwork";

// Native modal dialogs make the background inert and contain keyboard focus.
export function ExpandableCardArtwork({ triggerClassName = "", ...artwork }: ComponentProps<typeof CardArtwork> & { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className={`artwork-expand-trigger ${triggerClassName}`} aria-label={`${artwork.name}の画像を拡大`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <CardArtwork {...artwork} />
    </button>
    {open && createPortal(<dialog ref={dialog} className="artwork-modal" aria-label={`${artwork.name}の拡大画像`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDown={(event) => {
      // The close button is the only control: keep Tab/Shift+Tab on it,
      // including browsers that otherwise move focus into browser chrome.
      if (event.key === "Tab") { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus(); }
    }} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="artwork-modal-content">
        <button autoFocus className="artwork-modal-close" type="button" aria-label="拡大画像を閉じる" onClick={() => setOpen(false)}>×</button>
        <CardArtwork {...artwork} className="artwork-modal-image" eager sizes="100vw" />
      </div>
    </dialog>, document.body)}
  </>;
}
