"use client";

import { useState } from "react";
import Link from "next/link";
import { setOnlineLobbySelectedDeckAction } from "@/app/rooms/actions";
import { CardArtwork } from "@/components/card-artwork";

type LobbyDeckChoice = { id: string; name: string; format: string; imageUrl: string | null };

export function OnlineLobbyDeckPicker({ decks, lobbyId, selectedDeckId }: { decks: LobbyDeckChoice[]; lobbyId: string; selectedDeckId: string | null }) {
  const [selectedId, setSelectedId] = useState(selectedDeckId ?? "");
  const selected = decks.find((deck) => deck.id === selectedId) ?? null;
  return <form action={setOnlineLobbySelectedDeckAction} className="online-lobby-deck-picker">
    <input name="lobbyId" type="hidden" value={lobbyId} />
    <span className="online-lobby-deck-icon">{selected ? <CardArtwork imageUrl={selected.imageUrl} name={selected.name} sizes="56px" /> : "デッキを選択"}</span>
    {selected ? <Link className="online-lobby-deck-edit" href={`/decks/${selected.id}/edit`}><span aria-hidden="true" className="ui-icon ui-icon-edit" />編集</Link> : <span aria-disabled="true" className="online-lobby-deck-edit disabled"><span aria-hidden="true" className="ui-icon ui-icon-edit" />編集</span>}
    <label><span>{selected?.name ?? "デッキ名"}</span><select aria-label="このルームで使うデッキ" name="deckId" onChange={(event) => { setSelectedId(event.target.value); event.currentTarget.form?.requestSubmit(); }} required value={selectedId}><option disabled value="">デッキを選択</option>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}（{deck.format === "advanced" ? "アドバンス" : "オリジナル"}）</option>)}</select></label>
  </form>;
}
