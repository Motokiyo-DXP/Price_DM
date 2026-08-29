"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getCardImageUrl } from "@/lib/card-image";
import type { Json } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { initialOnlineBoard, PlaytestBoard, type BoardState, type DeckCard, type PlayerId } from "@/components/playtest-board";

type SnapshotCard = { canonicalCardId: number; imageKey: string | null; name: string; quantity: number; sortOrder: number };
export type OnlineDeckSnapshot = { name: string; cards: SnapshotCard[] };

function snapshotCards(snapshot: OnlineDeckSnapshot): DeckCard[] {
  return snapshot.cards.map((card) => ({ canonicalCardId: card.canonicalCardId, imageUrl: getCardImageUrl(card.imageKey), name: card.name, quantity: card.quantity, sortOrder: card.sortOrder }));
}

export function OnlineMatchBoard({ roomId, userId, isHost, status, state, stateVersion, hostDeck, guestDeck }: { roomId: string; userId: string; isHost: boolean; status: string; state: Json; stateVersion: number; hostDeck: OnlineDeckSnapshot; guestDeck: OnlineDeckSnapshot }) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [board, setBoard] = useState<BoardState | null>(() => status === "playing" ? state as unknown as BoardState : null);
  const [version, setVersion] = useState(stateVersion);
  const versionRef = useRef(stateVersion);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connection, setConnection] = useState("接続中");
  const [onlineCount, setOnlineCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const localPlayer: PlayerId = isHost ? "p1" : "p2";

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`room:${roomId}`, { config: { private: true, presence: { key: userId } } });
    channelRef.current = channel;
    channel.on("broadcast", { event: "game_state" }, ({ payload }) => {
      if (typeof payload?.version !== "number" || !payload?.state || payload.version <= versionRef.current) return;
      versionRef.current = payload.version;
      setVersion(payload.version);
      setBoard(payload.state as BoardState);
    }).on("presence", { event: "sync" }, () => {
      setOnlineCount(Object.keys(channel.presenceState()).length);
    }).subscribe(async (nextStatus) => {
      setConnection(nextStatus === "SUBSCRIBED" ? "同期接続済み" : nextStatus === "CHANNEL_ERROR" ? "接続エラー" : "接続中");
      if (nextStatus === "SUBSCRIBED") await channel.track({ onlineAt: new Date().toISOString() });
    });
    return () => { channelRef.current = null; void supabase.removeChannel(channel); };
  }, [roomId, supabase, userId]);

  async function broadcast(nextState: BoardState, nextVersion: number) {
    await channelRef.current?.send({ type: "broadcast", event: "game_state", payload: { state: nextState, version: nextVersion } });
  }

  async function startGame() {
    if (!supabase || !isHost) return;
    setError(null);
    const initial = initialOnlineBoard(snapshotCards(hostDeck), snapshotCards(guestDeck));
    const { data, error: startError } = await supabase.rpc("start_game_room", { p_initial_state: initial as unknown as Json, p_room_id: roomId });
    if (startError || !data?.[0]) { setError("対戦を開始できませんでした。ページを更新してください。"); return; }
    const next = data[0].state as unknown as BoardState;
    versionRef.current = data[0].state_version;
    setVersion(data[0].state_version);
    setBoard(next);
    await broadcast(next, data[0].state_version);
  }

  async function saveState(next: BoardState) {
    if (!supabase) return;
    setError(null);
    const { data, error: saveError } = await supabase.rpc("update_game_room_state", { p_expected_version: versionRef.current, p_room_id: roomId, p_state: next as unknown as Json });
    if (saveError || !data?.[0]) {
      const { data: latest } = await supabase.from("game_rooms").select("state, state_version").eq("id", roomId).single();
      if (latest) { versionRef.current = latest.state_version; setVersion(latest.state_version); setBoard(latest.state as unknown as BoardState); }
      setError("同時に操作されたため最新の盤面を読み直しました。もう一度操作してください。");
      return;
    }
    const saved = data[0].state as unknown as BoardState;
    versionRef.current = data[0].state_version;
    setVersion(data[0].state_version);
    setBoard(saved);
    await broadcast(saved, data[0].state_version);
  }

  if (!board) return <section className="match-start-panel"><strong>両者の接続：{onlineCount} / 2</strong><p>{isHost ? "両者が接続したら対戦を開始できます。" : "ホストが対戦を開始するまでお待ちください。"}</p>{error ? <p className="notice error">{error}</p> : null}{isHost ? <button className="button" disabled={onlineCount < 2} onClick={startGame} type="button">対戦を開始</button> : null}</section>;
  return <div className="online-match"><div className="online-match-meta"><strong>{onlineCount}人接続</strong><span>状態 #{version}・{connection}</span></div>{error ? <p className="notice error">{error}</p> : null}<PlaytestBoard cards={snapshotCards(isHost ? hostDeck : guestDeck)} connectionLabel={connection} deckName={`${hostDeck.name} vs ${guestDeck.name}`} externalState={board} localPlayer={localPlayer} onStateChange={(next) => void saveState(next)} /></div>;
}
