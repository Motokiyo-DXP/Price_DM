"use client";

import { useEffect, useRef, useState } from "react";
import { isAdminEmail } from "@/lib/admin-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function SiteNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setIsAdmin(isAdminEmail(data.user?.email));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(isAdminEmail(session?.user.email));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [menuOpen]);

  return <nav className="header-links" aria-label="主要メニュー">
    <div className="site-action-menu" ref={menuRef}>
      <button aria-controls="site-action-menu-panel" aria-expanded={menuOpen} aria-haspopup="menu" aria-label="メニュー" className="site-action-menu-trigger" onClick={() => setMenuOpen((open) => !open)} type="button"><span aria-hidden="true">≡</span><b>メニュー</b></button>
      {menuOpen ? <div aria-label="サイトメニュー" className="site-action-menu-panel" id="site-action-menu-panel" role="menu">
        <a href="/account" onClick={() => setMenuOpen(false)} role="menuitem"><span aria-hidden="true" className="ui-icon ui-icon-person" /><span><strong>アカウント</strong><small>アカウントの情報を変更</small></span></a>
        <a href="/friends" onClick={() => setMenuOpen(false)} role="menuitem"><span aria-hidden="true" className="ui-icon ui-icon-team" /><span><strong>フレンド</strong><small>フレンド申請・一覧を表示</small></span></a>
        {isAdmin ? <a href="/admin" onClick={() => setMenuOpen(false)} role="menuitem"><span aria-hidden="true">◆</span><span><strong>管理者ページ</strong><small>店舗・申請を管理する</small></span></a> : null}
      </div> : null}
    </div>
  </nav>;
}
