"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function DeckDirectory({ myDecks, publicDecks }: { myDecks: ReactNode; publicDecks: ReactNode }) {
  const params = useSearchParams();
  const search = params.get("tab") === "search" || params.has("share");
  function selectTab(value: "my" | "search") {
    const next = new URL(window.location.href);
    next.searchParams.delete("share");
    if (value === "my") next.searchParams.delete("tab");
    else next.searchParams.set("tab", "search");
    window.history.pushState(null, "", next);
  }
  return <>
    <div aria-label="デッキの表示" className="deck-directory-tabs" role="tablist">
      {(["my", "search"] as const).map((tab, index) => <button aria-controls={`deck-panel-${tab}`} aria-selected={search === (tab === "search")} id={`deck-tab-${tab}`} key={tab} onClick={() => selectTab(tab)} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? "my" : event.key === "End" ? "search" : tab === "my" ? "search" : "my";
          selectTab(next);
          document.getElementById(`deck-tab-${next}`)?.focus();
        }
      }} role="tab" tabIndex={search === (tab === "search") ? 0 : -1} type="button">{index === 0 ? "マイデッキ" : "デッキ検索"}</button>)}
    </div>
    <div aria-labelledby="deck-tab-my" hidden={search} id="deck-panel-my" role="tabpanel">{myDecks}</div>
    <div aria-labelledby="deck-tab-search" hidden={!search} id="deck-panel-search" role="tabpanel">{publicDecks}</div>
  </>;
}
