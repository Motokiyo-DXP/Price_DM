"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor instanceof HTMLAnchorElement && anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.getAttribute("href")!, location.href);
      if (destination.origin !== location.origin || destination.href === location.href || (destination.pathname === location.pathname && destination.search === location.search)) return;
      setPending(true);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setPending(false), 20000);
    };
    const backOrForward = () => {
      setPending(true);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setPending(false), 20000);
    };
    document.addEventListener("click", start, true);
    window.addEventListener("popstate", backOrForward);
    return () => {
      document.removeEventListener("click", start, true);
      window.removeEventListener("popstate", backOrForward);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  useEffect(() => {
    setPending(false);
    if (timeout.current) clearTimeout(timeout.current);
  }, [pathname]);

  return pending ? <div aria-label="ページを読み込み中" className="navigation-progress" role="progressbar"><span /></div> : null;
}
