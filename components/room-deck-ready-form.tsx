"use client";

import { useState } from "react";
import { setRoomDeckAction, setRoomReadyAction } from "@/app/rooms/actions";

type DeckChoice = { id: string; name: string };

export function RoomDeckReadyForm({ roomId, selectedDeckId, myReady, decks }: { roomId: string; selectedDeckId: string; myReady: boolean; decks: DeckChoice[] }) {
  const [deckId, setDeckId] = useState(selectedDeckId);
  const [changing, setChanging] = useState(false);

  return <div className="room-next-step">
    <form action={setRoomDeckAction}>
      <input name="roomId" type="hidden" value={roomId} />
      <label><span>使用デッキ</span><select defaultValue={selectedDeckId} disabled={myReady || changing} name="deckId" onChange={(event) => { setDeckId(event.target.value); setChanging(true); event.currentTarget.form?.requestSubmit(); }} required>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label>
    </form>
    <form action={setRoomReadyAction}>
      <input name="roomId" type="hidden" value={roomId} />
      <input name="ready" type="hidden" value={myReady ? "false" : "true"} />
      <input name="deckId" type="hidden" value={deckId} />
      <button className={myReady ? "secondary-button" : "button"} disabled={changing} type="submit">{myReady ? "準備完了を取り消す" : "準備完了"}</button>
    </form>
    <p>対戦者2名が準備完了すると、自動的に対戦が始まります。</p>
  </div>;
}
