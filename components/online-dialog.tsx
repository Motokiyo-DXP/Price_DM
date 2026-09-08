"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function OnlineDismissibleLayer({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return <div className="online-dialog-backdrop" onPointerDown={(event) => {
    if (event.target === event.currentTarget) onDismiss();
  }}>{children}</div>;
}

export function OnlineRouteDialog({ children, dismissHref }: { children: ReactNode; dismissHref: string }) {
  const router = useRouter();
  return <OnlineDismissibleLayer onDismiss={() => router.replace(dismissHref)}>{children}</OnlineDismissibleLayer>;
}

export function OnlineRoomMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  return <div className="online-room-menu" ref={rootRef}>
    <button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} type="button">ルームメニュー</button>
    {open ? <section aria-label="ルームメニュー" className="online-room-menu-panel" role="dialog">{children}<button className="secondary-button" onClick={() => setOpen(false)} type="button">閉じる</button></section> : null}
  </div>;
}
