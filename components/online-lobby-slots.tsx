"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enterOnlineMatchSlotAction } from "@/app/rooms/actions";

type LobbySlot = {
  id: string;
  slot_number: number;
  format: string;
  time_limit_minutes: number;
  game_room_id: string | null;
  status: string;
  player_count: number;
  spectator_count: number;
  host_display_name: string | null;
  host_avatar_url: string | null;
  guest_display_name: string | null;
  guest_avatar_url: string | null;
  deck_is_public: boolean;
};

export function OnlineLobbySlots({ lobbyId, myMatchIds, slots }: { lobbyId: string; myMatchIds: string[]; slots: LobbySlot[] }) {
  const router = useRouter();
  const [activeSlot, setActiveSlot] = useState<LobbySlot | null>(null);
  const [format, setFormat] = useState("original");
  const [role, setRole] = useState<"player" | "spectator">("player");
  const [deckIsPublic, setDeckIsPublic] = useState(true);

  function openSlot(slot: LobbySlot) {
    if (slot.status === "playing" && slot.game_room_id && myMatchIds.includes(slot.game_room_id)) {
      router.push(`/rooms/${slot.game_room_id}/battle`);
      return;
    }
    setActiveSlot(slot);
    setFormat(slot.format);
    setDeckIsPublic(slot.deck_is_public);
    setRole(slot.player_count >= 2 && !myMatchIds.includes(slot.game_room_id ?? "") ? "spectator" : "player");
  }

  return <>
    <div className="match-reception-list">{slots.map((slot) => <button className="match-reception" key={slot.id} onClick={() => openSlot(slot)} type="button">
      <span className="match-reception-number">{String(slot.slot_number).padStart(2, "0")}</span>
      <span className="match-reception-player"><b className={slot.host_avatar_url ? "has-image" : ""} style={slot.host_avatar_url ? { backgroundImage: `url("${slot.host_avatar_url}")` } : undefined}>{slot.host_avatar_url ? null : "＋"}</b><span><strong>{slot.host_display_name ?? "募集中"}</strong><small>{slot.format === "advanced" ? "アドバンス" : "オリジナル"}・{slot.time_limit_minutes}分</small></span></span>
      <span className="match-reception-versus">VS</span>
      <span className="match-reception-player guest"><b className={slot.guest_avatar_url ? "has-image" : ""} style={slot.guest_avatar_url ? { backgroundImage: `url("${slot.guest_avatar_url}")` } : undefined}>{slot.guest_avatar_url ? null : "＋"}</b><span><strong>{slot.guest_display_name ?? "募集中"}</strong><small>{slot.guest_display_name ? "参加中" : "対戦者を受付中"}</small></span></span>
      <span className={`match-reception-action ${slot.player_count >= 2 ? "spectate" : "join"}`}>{slot.status === "playing" && slot.game_room_id && myMatchIds.includes(slot.game_room_id) ? "対戦に戻る" : slot.player_count >= 2 ? "観戦" : "参加"}</span>
      {slot.spectator_count ? <span className="match-reception-meta">観戦 {slot.spectator_count}人</span> : null}
    </button>)}</div>
    {activeSlot ? <div className="online-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setActiveSlot(null); }}><form action={enterOnlineMatchSlotAction} className="match-entry-sheet"><input name="lobbyId" type="hidden" value={lobbyId} /><input name="slotId" type="hidden" value={activeSlot.id} /><header><div><p>MATCH {activeSlot.slot_number}</p><h2>マッチ受付の設定</h2></div><button aria-label="閉じる" onClick={() => setActiveSlot(null)} type="button">×</button></header><fieldset><legend>参加方法</legend><div className="match-role-switch"><label className={role === "player" ? "active" : ""}><input checked={role === "player"} disabled={activeSlot.player_count >= 2 && !myMatchIds.includes(activeSlot.game_room_id ?? "")} name="role" onChange={() => setRole("player")} type="radio" value="player" />対戦者</label><label className={role === "spectator" ? "active" : ""}><input checked={role === "spectator"} disabled={!activeSlot.game_room_id} name="role" onChange={() => setRole("spectator")} type="radio" value="spectator" />観戦者</label></div></fieldset><fieldset disabled={Boolean(activeSlot.game_room_id)}><legend>ルール</legend><label>フォーマット<select name="format" onChange={(event) => setFormat(event.target.value)} value={format}><option value="original">オリジナル</option><option value="advanced">アドバンス</option></select></label><label>時間制限<select defaultValue={activeSlot.time_limit_minutes} name="timeLimit"><option value="10">10分</option><option value="15">15分</option><option value="20">20分</option><option value="30">30分</option><option value="40">40分</option><option value="60">60分</option></select></label><label className="match-deck-visibility"><span><strong>デッキを公開する</strong><small>対戦相手にあなたのデッキを公開します。</small></span><input checked={deckIsPublic} name="deckIsPublic" onChange={(event) => setDeckIsPublic(event.target.checked)} role="switch" type="checkbox" value="true" /></label></fieldset>{activeSlot.game_room_id ? <><input name="format" type="hidden" value={activeSlot.format} /><input name="timeLimit" type="hidden" value={activeSlot.time_limit_minutes} /></> : null}<button className="button" type="submit">{role === "spectator" ? "観戦する" : "この受付に参加"}</button></form></div> : null}
  </>;
}
