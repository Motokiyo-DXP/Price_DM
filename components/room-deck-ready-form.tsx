"use client";

import { useState } from "react";
import { CardArtwork } from "@/components/card-artwork";
import { setRoomDeckAction, setRoomReadyAction } from "@/app/rooms/actions";

type DeckChoice = { id: string; name: string; imageUrl: string | null };

export function RoomDeckSelect({ roomId, selectedDeckId, myReady, decks }: { roomId: string; selectedDeckId: string; myReady: boolean; decks: DeckChoice[] }) {
  const [open, setOpen] = useState(false);
  return <div className="room-deck-select">
    <button aria-expanded={open} aria-label="使用デッキを変更" disabled={myReady} onClick={() => setOpen((value) => !value)} type="button"><span aria-hidden="true" className="ui-icon ui-icon-dropdown" /></button>
    {open ? <div className="room-deck-options" role="listbox">{decks.map((deck) => <form action={setRoomDeckAction} key={deck.id}><input name="roomId" type="hidden" value={roomId} /><input name="deckId" type="hidden" value={deck.id} /><button aria-selected={deck.id === selectedDeckId} type="submit"><CardArtwork imageUrl={deck.imageUrl} name={`${deck.name}のアイコン`} sizes="40px" /><span>{deck.name}</span></button></form>)}</div> : null}
  </div>;
}

export function RoomReadyButton({ roomId, selectedDeckId, myReady }: { roomId: string; selectedDeckId: string; myReady: boolean }) {
  return <div className="room-next-step"><form action={setRoomReadyAction}><input name="roomId" type="hidden" value={roomId} /><input name="ready" type="hidden" value={myReady ? "false" : "true"} /><input name="deckId" type="hidden" value={selectedDeckId} /><button className={myReady ? "secondary-button" : "button"} type="submit">{myReady ? "準備完了を取り消す" : "準備完了"}</button></form><p>対戦者2名が準備完了すると、自動的に対戦が始まります。</p></div>;
}
