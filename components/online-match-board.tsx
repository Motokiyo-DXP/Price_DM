"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { PlaytestBoard, type BoardState, type CardInstance, type PlayerId, type ServerDeckInspectionRequest, type ServerEffectWarningRequest, type ServerInspectionRequest, type ServerShuffleRequest, type ServerYobinionRequest } from "@/components/playtest-board";
import { parseRemoteCardOperation, type RemoteCardOperation } from "@/lib/online-card-operation";
import { readNewerRoomSnapshot } from "@/lib/online-room-snapshot";
import { describeOpponentBoardChange } from "@/lib/online-board-change";

export type OnlineDeckSnapshot = { name: string; format?: string; cards: unknown[] };
type RoomPresence = { user_id: string; display_name: string; connection_role: string; last_seen_at: string | null; is_online: boolean };
type RoomLifecycle = { status: string; winner_user_id: string | null; end_reason: string | null; deadline: string | null; host_rematch_ready: boolean; guest_rematch_ready: boolean };
type HistoryStatus = { can_undo: boolean; can_redo: boolean; undo_requires_approval: boolean; pending_request_id: string | null; pending_requester_name: string | null };

export function OnlineMatchBoard({ roomId, returnLobbyId, userId, isHost, isSpectator = false, status, state, stateVersion, hostDeck, guestDeck, timeLimitMinutes, startedAt, winnerUserId, endReason, hostRematchReady, guestRematchReady }: { roomId: string; returnLobbyId: string | null; userId: string; isHost: boolean; isSpectator?: boolean; status: string; state: Json; stateVersion: number; hostDeck: OnlineDeckSnapshot; guestDeck: OnlineDeckSnapshot; timeLimitMinutes: number; startedAt: string | null; winnerUserId: string | null; endReason: string | null; hostRematchReady: boolean; guestRematchReady: boolean }) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [board, setBoard] = useState<BoardState | null>(() => (status === "playing" || status === "finished") && state && typeof state === "object" && "players" in state ? state as unknown as BoardState : null);
  const [version, setVersion] = useState(stateVersion);
  const versionRef = useRef(stateVersion);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connection, setConnection] = useState("接続中");
  const [onlineCount, setOnlineCount] = useState(1);
  const [roomPresence, setRoomPresence] = useState<RoomPresence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({ can_undo: false, can_redo: false, undo_requires_approval: false, pending_request_id: null, pending_requester_name: null });
  const [historyBusy, setHistoryBusy] = useState(false);
  const [remoteOperation, setRemoteOperation] = useState<RemoteCardOperation | null>(null);
  const remoteOperationTimer = useRef<number | null>(null);
  const [opponentActionNotice, setOpponentActionNotice] = useState<string | null>(null);
  const opponentActionTimer = useRef<number | null>(null);
  const boardRef = useRef(board);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<BoardState | null>(null);
  const [lifecycle, setLifecycle] = useState<RoomLifecycle>({
    status, winner_user_id: winnerUserId, end_reason: endReason,
    deadline: startedAt ? new Date(new Date(startedAt).getTime() + timeLimitMinutes * 60_000).toISOString() : null,
    host_rematch_ready: hostRematchReady, guest_rematch_ready: guestRematchReady,
  });
  const [now, setNow] = useState(() => Date.now());
  const localPlayer: PlayerId = isHost ? "p1" : "p2";
  const [showOpeningNotice, setShowOpeningNotice] = useState(false);
  const openingNoticeKey = `online-opening:${roomId}:${startedAt ?? "initial"}`;

  useEffect(() => {
    if (isSpectator || lifecycle.status !== "playing" || !board || board.turn !== 1 || board.activePlayer !== "p1") return;
    if (window.localStorage.getItem(openingNoticeKey) !== "dismissed") setShowOpeningNotice(true);
  }, [board, isSpectator, lifecycle.status, openingNoticeKey]);

  function dismissOpeningNotice() {
    window.localStorage.setItem(openingNoticeKey, "dismissed");
    setShowOpeningNotice(false);
  }

  useEffect(() => { boardRef.current = board; }, [board]);

  const refreshHistoryStatus = useCallback(async () => {
    if (!supabase || isSpectator) return;
    const { data } = await supabase.rpc("get_game_room_history_status", { p_room_id: roomId });
    if (data?.[0]) setHistoryStatus(data[0]);
  }, [isSpectator, roomId, supabase]);

  const refreshBoardState = useCallback(async () => {
    if (!supabase) return;
    const { data, error: refreshError } = await supabase.rpc("get_game_room_state", { p_room_id: roomId });
    if (refreshError) {
      setError("再接続後の盤面を取得できませんでした。接続を確認してください。");
      return;
    }
    const latest = readNewerRoomSnapshot(versionRef.current, data?.[0]);
    if (!latest) return;
    versionRef.current = latest.stateVersion;
    setVersion(latest.stateVersion);
    boardRef.current = latest.state;
    setBoard(latest.state);
    setError(null);
    return latest;
  }, [roomId, supabase]);

  useEffect(() => {
    if (!supabase) return;
    const refreshPresence = async () => {
      const { data } = await supabase.rpc("list_game_room_presence", { p_room_id: roomId });
      if (data) setRoomPresence(data);
    };
    const refreshLifecycle = async () => {
      const { data } = await supabase.rpc("reconcile_game_room_lifecycle", { p_room_id: roomId });
      if (data?.[0]) {
        setLifecycle(data[0]);
        if (data[0].status === "ready") setBoard(null);
      }
    };
    const channel = supabase.channel(`room:${roomId}`, { config: { private: true, presence: { key: userId } } });
    channelRef.current = channel;
    channel.on("broadcast", { event: "game_state" }, ({ payload }) => {
      if (typeof payload?.version !== "number" || payload.version <= versionRef.current) return;
      const previous = boardRef.current;
      void refreshBoardState().then((latest) => {
        if (!latest) return;
        if (!isSpectator && previous && payload.actorUserId !== userId && latest.state.activePlayer === localPlayer) {
          const message = describeOpponentBoardChange(previous, latest.state, typeof payload.actorDisplayName === "string" ? payload.actorDisplayName : "対戦相手");
          if (message) {
            if (opponentActionTimer.current !== null) window.clearTimeout(opponentActionTimer.current);
            setOpponentActionNotice(message);
            opponentActionTimer.current = window.setTimeout(() => setOpponentActionNotice(null), 4_000);
          }
        }
        void refreshHistoryStatus();
      });
    }).on("broadcast", { event: "card_operation" }, ({ payload }) => {
      const operation = parseRemoteCardOperation(payload, userId);
      if (!operation) return;
      if (remoteOperationTimer.current !== null) window.clearTimeout(remoteOperationTimer.current);
      setRemoteOperation(operation.active ? operation : null);
      if (operation.active) remoteOperationTimer.current = window.setTimeout(() => setRemoteOperation(null), 3_000);
    }).on("presence", { event: "sync" }, () => {
      setOnlineCount(Object.keys(channel.presenceState()).length);
    }).on("postgres_changes", { event: "*", schema: "public", table: "game_room_presence", filter: `room_id=eq.${roomId}` }, () => {
      void refreshPresence();
    }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, () => {
      void Promise.all([refreshLifecycle(), refreshHistoryStatus()]);
    }).subscribe(async (nextStatus) => {
      setConnection(nextStatus === "SUBSCRIBED" ? "同期接続済み" : nextStatus === "CHANNEL_ERROR" ? "接続エラー" : "接続中");
      if (nextStatus === "SUBSCRIBED") {
        await channel.track({ onlineAt: new Date().toISOString() });
        await supabase.rpc("touch_game_room_presence", { p_room_id: roomId });
        await Promise.all([refreshBoardState(), refreshPresence(), refreshLifecycle(), refreshHistoryStatus()]);
      }
    });
    const heartbeatTimer = window.setInterval(async () => {
      await supabase.rpc("touch_game_room_presence", { p_room_id: roomId });
      await Promise.all([refreshPresence(), refreshLifecycle()]);
    }, 15_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1_000);
    window.addEventListener("online", refreshBoardState);
    return () => { channelRef.current = null; if (remoteOperationTimer.current !== null) window.clearTimeout(remoteOperationTimer.current); if (opponentActionTimer.current !== null) window.clearTimeout(opponentActionTimer.current); window.clearInterval(heartbeatTimer); window.clearInterval(clockTimer); window.removeEventListener("online", refreshBoardState); void supabase.removeChannel(channel); };
  }, [isSpectator, localPlayer, refreshBoardState, refreshHistoryStatus, roomId, supabase, userId]);

  useEffect(() => {
    if (!supabase || lifecycle.status !== "playing" || !lifecycle.deadline) return;
    const delay = Math.max(0, new Date(lifecycle.deadline).getTime() - Date.now());
    const timeout = window.setTimeout(async () => {
      const { data } = await supabase.rpc("reconcile_game_room_lifecycle", { p_room_id: roomId });
      if (data?.[0]) setLifecycle(data[0]);
    }, delay + 100);
    return () => window.clearTimeout(timeout);
  }, [lifecycle.deadline, lifecycle.status, roomId, supabase]);

  async function broadcast(_nextState: BoardState, nextVersion: number) {
    const ownPresence = roomPresence.find((member) => member.user_id === userId);
    await channelRef.current?.send({ type: "broadcast", event: "game_state", payload: { actorDisplayName: ownPresence?.display_name ?? "対戦相手", actorUserId: userId, version: nextVersion } });
  }

  async function broadcastCardOperation(signal: { active: boolean; cardId: string }) {
    if (isSpectator) return;
    const ownPresence = roomPresence.find((member) => member.user_id === userId);
    await channelRef.current?.send({
      type: "broadcast",
      event: "card_operation",
      payload: { ...signal, displayName: ownPresence?.display_name ?? "対戦相手", player: localPlayer, userId },
    });
  }

  async function serverShuffle(request: ServerShuffleRequest) {
    if (!supabase || isSpectator || lifecycle.status !== "playing") return;
    setError(null);
    const { data, error: shuffleError } = await supabase.rpc("shuffle_game_cards", {
      p_room_id: roomId,
      p_expected_version: versionRef.current,
      p_owner: request.owner,
      p_zone: request.zone,
      p_mode: request.mode,
      p_card_ids: request.cardIds ?? null,
      p_stack_id: request.stackId ?? null,
    });
    if (shuffleError || !data?.[0]) {
      setError("シャッフルを同期できませんでした。最新の盤面を取得します。");
      await refreshBoardState();
      return;
    }
    const next = data[0].state as unknown as BoardState;
    versionRef.current = data[0].state_version;
    setVersion(data[0].state_version);
    boardRef.current = next;
    setBoard(next);
    await broadcast(next, data[0].state_version);
    await refreshHistoryStatus();
  }

  async function serverYobinion(request: ServerYobinionRequest) {
    if (!supabase || isSpectator || lifecycle.status !== "playing") return;
    setError(null);
    const { data, error: yobinionError } = await supabase.rpc("run_game_yobinion", {
      p_room_id: roomId,
      p_expected_version: versionRef.current,
      p_owner: request.owner,
      p_source_id: request.sourceId,
      p_dragon_only: request.dragonOnly,
    });
    if (yobinionError || !data?.[0]) {
      setError("ヨビニオンを同期できませんでした。最新の盤面を取得します。");
      await refreshBoardState();
      return;
    }
    if (!data[0].found) {
      setError("ヨビニオンの対象が見つかりませんでした。");
      return;
    }
    const next = data[0].state as unknown as BoardState;
    versionRef.current = data[0].state_version;
    setVersion(data[0].state_version);
    boardRef.current = next;
    setBoard(next);
    await broadcast(next, data[0].state_version);
    await refreshHistoryStatus();
  }

  async function serverInspection(request: ServerInspectionRequest | null) {
    if (!supabase || isSpectator || lifecycle.status !== "playing") return;
    setError(null);
    const { data, error: inspectionError } = await supabase.rpc("set_game_card_inspection", {
      p_room_id: roomId,
      p_expected_version: versionRef.current,
      p_owner: request?.owner ?? null,
      p_card_id: request?.cardId ?? null,
    });
    if (inspectionError || !data?.[0]) {
      setError("カードの確認状態を同期できませんでした。最新の盤面を取得します。");
      await refreshBoardState();
      return;
    }
    const next = data[0].state as unknown as BoardState;
    versionRef.current = data[0].state_version;
    setVersion(data[0].state_version);
    boardRef.current = next;
    setBoard(next);
    await broadcast(next, data[0].state_version);
  }

  async function serverDeckInspection(request: ServerDeckInspectionRequest): Promise<CardInstance[] | null> {
    if (!supabase || isSpectator || lifecycle.status !== "playing" || request.owner !== localPlayer) return null;
    setError(null);
    const { data, error: inspectionError } = await supabase.rpc("inspect_own_game_deck", {
      p_room_id: roomId,
      p_count: request.count === "max" ? null : request.count,
    });
    if (inspectionError || !Array.isArray(data) || !data.every((card) => card && !Array.isArray(card) && typeof card === "object" && typeof card.instanceId === "string")) {
      setError("山札を安全に取得できませんでした。最新の盤面を確認してください。");
      return null;
    }
    return data as unknown as CardInstance[];
  }

  async function surrender() {
    if (!supabase || isSpectator || !window.confirm("投了しますか？ この対戦は敗北として終了します。")) return;
    const { error: surrenderError } = await supabase.rpc("surrender_game_room", { p_room_id: roomId });
    if (surrenderError) { setError("投了処理を完了できませんでした。"); return; }
    const { data } = await supabase.rpc("reconcile_game_room_lifecycle", { p_room_id: roomId });
    if (data?.[0]) setLifecycle(data[0]);
  }

  async function requestRematch() {
    if (!supabase || isSpectator || lifecycle.status !== "finished") return;
    const { data, error: rematchError } = await supabase.rpc("request_game_room_rematch", { p_room_id: roomId });
    if (rematchError || !data?.[0]) { setError("再戦を申請できませんでした。"); return; }
    setLifecycle((current) => ({ ...current, ...data[0], winner_user_id: current.winner_user_id, end_reason: current.end_reason, deadline: current.deadline }));
    if (data[0].status === "ready") setBoard(null);
  }

  function saveState(next: BoardState) {
    if (!supabase || isSpectator || lifecycle.status !== "playing") return;
    pendingSaveRef.current = next;
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    void (async () => {
      try {
        while (pendingSaveRef.current) {
          const pending = pendingSaveRef.current;
          pendingSaveRef.current = null;
          setError(null);
          const { data, error: saveError } = await supabase.rpc("update_game_room_state", { p_expected_version: versionRef.current, p_room_id: roomId, p_state: pending as unknown as Json });
          if (saveError || !data?.[0]) {
            pendingSaveRef.current = null;
            await refreshBoardState();
            setError("同時に操作されたため最新の盤面を読み直しました。もう一度操作してください。");
            break;
          }
          const saved = data[0].state as unknown as BoardState;
          versionRef.current = data[0].state_version;
          setVersion(data[0].state_version);
          boardRef.current = saved;
          setBoard(saved);
          await broadcast(saved, data[0].state_version);
        }
        await refreshHistoryStatus();
      } finally {
        saveInFlightRef.current = false;
        const pending = pendingSaveRef.current;
        if (pending) {
          pendingSaveRef.current = null;
          saveState(pending);
        }
      }
    })();
  }

  async function serverEffectWarning(request: ServerEffectWarningRequest) {
    if (!supabase || isSpectator || lifecycle.status !== "playing") return;
    setError(null);
    const { data, error: warningError } = await supabase.rpc("send_game_effect_warning", {
      p_card_id: request.cardId,
      p_expected_version: versionRef.current,
      p_owner: request.owner,
      p_room_id: roomId,
    });
    if (warningError || !data?.[0]) {
      const { data: latest } = await supabase.rpc("get_game_room_state", { p_room_id: roomId });
      if (latest?.[0]) { versionRef.current = latest[0].state_version; setVersion(latest[0].state_version); setBoard(latest[0].state as unknown as BoardState); }
      setError("警告を送信できませんでした。最新の盤面を確認してください。");
      return;
    }
    const next = data[0].state as unknown as BoardState;
    versionRef.current = data[0].state_version;
    setVersion(data[0].state_version);
    setBoard(next);
    await broadcast(next, data[0].state_version);
  }

  async function runHistoryAction(kind: "undo" | "redo") {
    if (!supabase || isSpectator || historyBusy) return;
    setHistoryBusy(true);
    setError(null);
    const call = kind === "undo"
      ? supabase.rpc("undo_game_room_action", { p_expected_version: versionRef.current, p_room_id: roomId })
      : supabase.rpc("redo_game_room_action", { p_expected_version: versionRef.current, p_room_id: roomId });
    const { data, error: historyError } = await call;
    if (historyError || !data?.[0]) {
      setError(kind === "undo" ? "この操作は現在戻せません。最新の盤面を確認してください。" : "この操作は現在やり直せません。");
      await refreshHistoryStatus();
      setHistoryBusy(false);
      return;
    }
    const result = data[0];
    if (result.result === "approval_required") {
      setError("ターン終了の取り消し承認を相手へ送りました。");
    } else {
      const next = result.state as unknown as BoardState;
      versionRef.current = result.state_version;
      setVersion(result.state_version);
      setBoard(next);
      await broadcast(next, result.state_version);
    }
    await refreshHistoryStatus();
    setHistoryBusy(false);
  }

  async function respondUndoRequest(approve: boolean) {
    if (!supabase || !historyStatus.pending_request_id || historyBusy) return;
    setHistoryBusy(true);
    setError(null);
    const { data, error: responseError } = await supabase.rpc("respond_game_room_undo_request", { p_approve: approve, p_expected_version: versionRef.current, p_request_id: historyStatus.pending_request_id });
    if (responseError || !data?.[0]) {
      setError("取り消し要求は期限切れです。最新の盤面を読み直してください。");
    } else if (data[0].result === "approved") {
      const next = data[0].state as unknown as BoardState;
      versionRef.current = data[0].state_version;
      setVersion(data[0].state_version);
      setBoard(next);
      await broadcast(next, data[0].state_version);
    }
    await refreshHistoryStatus();
    setHistoryBusy(false);
  }

  const connectionSummary = <><div className="room-presence-list">{roomPresence.map((member) => <span className={member.is_online ? "online" : "offline"} key={member.user_id}><i aria-hidden="true" />{member.display_name}：{member.is_online ? "オンライン" : "切断"}</span>)}</div>{opponentActionNotice ? <button className="online-opponent-action-notice" onClick={() => setOpponentActionNotice(null)} type="button">{opponentActionNotice}</button> : null}</>;
  const remainingSeconds = lifecycle.deadline ? Math.max(0, Math.ceil((new Date(lifecycle.deadline).getTime() - now) / 1000)) : null;
  const timerLabel = remainingSeconds === null ? `${timeLimitMinutes}:00` : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const rematchRequested = isHost ? lifecycle.host_rematch_ready : lifecycle.guest_rematch_ready;
  const finishMessage = lifecycle.end_reason === "time_limit" ? "時間切れにより引き分けです。" : lifecycle.winner_user_id === userId ? "あなたの勝利です。" : lifecycle.winner_user_id ? "あなたの敗北です。" : "対戦が終了しました。";
  const finishReason = lifecycle.end_reason === "surrender" ? "投了" : lifecycle.end_reason === "disconnect" ? "切断タイムアウト" : lifecycle.end_reason === "time_limit" ? "制限時間終了" : "対戦終了";
  const finishDialog = lifecycle.status === "finished" ? <div className="online-dialog-backdrop"><section className="match-finish-dialog"><p>{finishReason}</p><h2>{finishMessage}</h2>{!isSpectator ? <button className="button" disabled={rematchRequested} onClick={() => void requestRematch()} type="button">{rematchRequested ? "相手の再戦希望を待っています" : "再戦"}</button> : null}<a className="secondary-button" href={returnLobbyId ? `/rooms/lobbies/${returnLobbyId}` : "/rooms"}>ルームへ戻る</a></section></div> : null;
  const undoApprovalDialog = historyStatus.pending_request_id ? <div className="online-dialog-backdrop"><section className="match-finish-dialog"><p>ターン終了の取り消し</p><h2>{historyStatus.pending_requester_name ?? "対戦相手"}がターン終了を取り消そうとしています。</h2><div className="online-dialog-actions"><button className="button" disabled={historyBusy} onClick={() => void respondUndoRequest(true)} type="button">承認</button><button className="secondary-button" disabled={historyBusy} onClick={() => void respondUndoRequest(false)} type="button">拒否</button></div></section></div> : null;
  if (!board) return <section className="match-start-panel"><strong>接続中：{onlineCount}人</strong>{connectionSummary}<p>両対戦者の準備完了後、対戦を自動的に開始します。</p>{error ? <p className="notice error">{error}</p> : null}</section>;
  return <div className="online-match">
    <div className="online-match-meta"><strong>{onlineCount}人接続{isSpectator ? "・観戦中" : ""}</strong><strong className={`online-turn-label ${board.activePlayer === "p1" ? "first" : "second"}`}>{board.activePlayer === "p1" ? "先攻" : "後攻"}{board.turn}ターン目</strong><b className={remainingSeconds !== null && remainingSeconds <= 60 ? "urgent" : ""}>{timerLabel}</b><span>状態 #{version}・{connection}</span></div>
    {connectionSummary}{error ? <p className="notice error">{error}</p> : null}
    <PlaytestBoard onlineReveal initialOpponentAuxiliaryZone="mana" initialOpponentCollapsed={false} canExternalRedo={historyStatus.can_redo} canExternalUndo={historyStatus.can_undo} cards={[]} deckFormat={hostDeck.format} deckName={hostDeck.name} externalHistoryBusy={historyBusy} externalState={board} initialState={board} localPlayer={localPlayer} onCardInteractionChange={isSpectator ? undefined : (signal) => void broadcastCardOperation(signal)} onNonScrollInteraction={() => setOpponentActionNotice(null)} onDeckInspectionRequest={isSpectator ? undefined : serverDeckInspection} onEffectWarningRequest={isSpectator ? undefined : (request) => void serverEffectWarning(request)} onInspectionRequest={isSpectator ? undefined : (request) => void serverInspection(request)} onExternalRedo={isSpectator ? undefined : () => void runHistoryAction("redo")} onExternalUndo={isSpectator ? undefined : () => void runHistoryAction("undo")} onResetRequest={isSpectator ? undefined : () => void surrender()} onShuffleRequest={isSpectator ? undefined : (request) => void serverShuffle(request)} onYobinionRequest={isSpectator ? undefined : (request) => void serverYobinion(request)} opponentDeckFormat={guestDeck.format} opponentDeckName={guestDeck.name} onStateChange={isSpectator ? undefined : saveState} readOnly={isSpectator || lifecycle.status !== "playing"} remoteCardInteraction={remoteOperation?.active ? remoteOperation : null} revealHiddenCards={isSpectator} resetLabel={isSpectator ? undefined : "投了"} />
    {undoApprovalDialog}{finishDialog}{showOpeningNotice ? <div className={`opening-notice-backdrop ${localPlayer === "p1" ? "first" : "second"}`} onClick={dismissOpeningNotice} role="presentation"><section aria-label="先攻後攻の通知" aria-modal="true" className="opening-notice" role="dialog"><h2>あなたは<span>{localPlayer === "p1" ? "先攻" : "後攻"}</span>です</h2><p>画面のどこをタップしても閉じます</p></section></div> : null}
  </div>;
}

