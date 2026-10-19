"use client";

import { useEffect, useState } from "react";
import { ShoppingListView } from "@/components/shopping-list-view";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { ShoppingCard, ShoppingPriceRecord } from "@/lib/shopping-list";

type Snapshot = { cards: ShoppingCard[]; records: ShoppingPriceRecord[] };
export function ShoppingListLive({ token, shareId }: { token?: string; shareId?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("買い物リストを読み込み中…");
  useEffect(() => {
    let source: EventSource;
    let lastVerified = Date.now();
    let denied = false;
    const connect = () => {
      source?.close();
      denied = false;
      lastVerified = Date.now();
      setSnapshot(null);
      setStatus("買い物リストに接続中…");
      const params = new URLSearchParams(token ? { token } : shareId ? { share: shareId } : {});
      source = new EventSource(`/api/shopping-list/live?${params}`);
      source.addEventListener("snapshot", (event) => {
        lastVerified = Date.now();
        setSnapshot(JSON.parse(event.data) as Snapshot);
        setStatus("");
      });
      source.addEventListener("verified", () => { lastVerified = Date.now(); });
      source.addEventListener("unavailable", () => {
        denied = true;
        source.close(); setSnapshot(null); setStatus("この買い物リストは閲覧できません。共有が解除されたか、ログインが必要です。");
      });
      source.onerror = () => { setSnapshot(null); setStatus("接続を確認しています。復帰後に最新のリストを取得します。"); };
    };
    const visible = () => { if (document.visibilityState === "visible") connect(); };
    const offline = () => { source?.close(); setSnapshot(null); setStatus("オフラインです。復帰後に最新のリストを取得します。"); };
    connect();
    const auth = !token ? createBrowserSupabaseClient()?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        denied = true; source?.close(); setSnapshot(null); setStatus("ログインが必要です。");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") connect();
    }) : undefined;
    // Fail closed if a silent network partition prevents revocation checks.
    const watchdog = setInterval(() => {
      if (!denied && Date.now() - lastVerified > 10_000) {
        setSnapshot(null);
        if (navigator.onLine && document.visibilityState === "visible") connect();
      }
    }, 1_000);
    window.addEventListener("online", connect);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => { auth?.data.subscription.unsubscribe(); source?.close(); clearInterval(watchdog); window.removeEventListener("online", connect); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); };
  }, [token, shareId]);
  if (!snapshot) return <div className="shopping-list-page"><p role="status">{status || "接続を確認しています…"}</p></div>;
  return <ShoppingListView cards={snapshot.cards} records={snapshot.records} readOnly={Boolean(token || shareId)} />;
}
