import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readNewerRoomSnapshot } from "./online-room-snapshot.ts";

test("再接続時はサーバーの更新番号が新しい盤面だけを復元する", () => {
  const latest = { state: { players: {}, turn: 3 }, state_version: 8 };
  assert.deepEqual(readNewerRoomSnapshot(7, latest), { state: latest.state, stateVersion: 8 });
  assert.equal(readNewerRoomSnapshot(8, latest), null);
  assert.equal(readNewerRoomSnapshot(9, latest), null);
});

test("不完全な盤面や不正な更新番号は復元しない", () => {
  assert.equal(readNewerRoomSnapshot(1, { state: {}, state_version: 2 }), null);
  assert.equal(readNewerRoomSnapshot(1, { state: { players: {} }, state_version: "2" }), null);
  assert.equal(readNewerRoomSnapshot(1, null), null);
});

test("Realtime再購読とonline復帰の両方から盤面照合を実行する", () => {
  const source = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("Promise.all([refreshBoardState(), refreshPresence()"));
  assert.ok(source.includes('window.addEventListener("online", refreshBoardState)'));
});

test("オンラインの全ヨビニオン起動経路は非公開山札をローカル検索せずサーバーへ委譲する", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  const onlineSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(boardSource.includes("function executeYobinion(owner: PlayerId, sourceId: string, dragonOnly: boolean)"));
  assert.ok(boardSource.includes("onYobinionRequest({ owner, sourceId, dragonOnly })"));
  assert.ok(boardSource.includes("executeYobinion(owner, cardId, yobinionSourceMode.dragon)"));
  assert.ok(boardSource.includes("executeYobinion(markingMenu.owner, markingMenu.card.instanceId, false)"));
  assert.ok(boardSource.includes("executeYobinion(markingMenu.owner, markingMenu.card.instanceId, true)"));
  assert.ok(onlineSource.includes('supabase.rpc("run_game_yobinion"'));
  assert.ok(onlineSource.includes("onYobinionRequest={isSpectator ? undefined"));
});

test("オンラインの確認と解除は専用RPCを通り通常の盤面保存から分離される", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  const onlineSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(boardSource.includes("onInspectionRequest(inspection ?"));
  assert.ok(boardSource.includes("if (onInspectionRequest) onInspectionRequest(pending)"));
  assert.ok(boardSource.includes("if (onInspectionRequest) onInspectionRequest({ owner: pending.owner, cardId: pending.card.instanceId })"));
  assert.ok(onlineSource.includes('supabase.rpc("set_game_card_inspection"'));
  assert.ok(onlineSource.includes("onInspectionRequest={isSpectator ? undefined"));
});

test("オンライン山札閲覧は本人専用RPCの応答だけをローカル表示し、共有盤面へ保存しない", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  const onlineSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  const boardStateSource = readFileSync(new URL("./playfield-board.ts", import.meta.url), "utf8");
  assert.ok(boardSource.includes("onDeckInspectionRequest?: (request: ServerDeckInspectionRequest) => Promise<CardInstance[] | null>"));
  assert.ok(boardSource.includes("setDeckInspection({ cards: inspectedCards"));
  assert.ok(boardSource.includes('className="deck-view-actions"'));
  assert.ok(onlineSource.includes('supabase.rpc("inspect_own_game_deck"'));
  assert.ok(onlineSource.includes("request.owner !== localPlayer"));
  assert.equal(boardStateSource.includes("deckInspection"), false);
});

test("山札確認は縦ダイヤルとMAXを排他利用し、前回枚数と表示順をローカル状態だけで保持する", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.ok(boardSource.includes("function DeckCountDial"));
  assert.ok(boardSource.includes('role="spinbutton"'));
  assert.equal(boardSource.includes('aria-label="閲覧枚数" disabled='), false);
  assert.equal(boardSource.includes('type="number"'), false);
  assert.ok(boardSource.includes('useState<Record<PlayerId, number>>({ p1: 3, p2: 3 })'));
  assert.ok(boardSource.includes('count: Math.max(1, Math.min(deckDialCounts[markingMenu.owner], max || 1))'));
  assert.ok(boardSource.includes('onUseDial={() => setDeckViewConfirm((current) => current?.useMax ? { ...current, useMax: false } : current)}'));
  assert.ok(boardSource.includes('onClick={() => setDeckViewConfirm((current) => current ? { ...current, useMax: true } : current)}'));
  assert.ok(boardSource.includes('mode: pending.useMax ? "cost" : "deck"'));
  assert.ok(boardSource.includes('if (inspection.mode === "deck") return inspection.cards'));
});

test("オンラインの効果警告はカード名をクライアント通知へ埋め込まず専用RPCへ委譲する", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  const onlineSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(boardSource.includes("onEffectWarningRequest({ owner: markingMenu.owner, cardId: markingMenu.card.instanceId })"));
  assert.ok(onlineSource.includes('supabase.rpc("send_game_effect_warning"'));
  assert.ok(onlineSource.includes("onEffectWarningRequest={isSpectator ? undefined"));
});

test("閉じても安全なオンラインダイアログだけが共通の外側pointerdownとEscapeで閉じる", () => {
  const dialogSource = readFileSync(new URL("../components/online-dialog.tsx", import.meta.url), "utf8");
  const lobbySource = readFileSync(new URL("../app/rooms/lobbies/[lobbyId]/page.tsx", import.meta.url), "utf8");
  const slotsSource = readFileSync(new URL("../components/online-lobby-slots.tsx", import.meta.url), "utf8");
  const matchSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(dialogSource.includes("event.target === event.currentTarget"));
  assert.ok(dialogSource.includes('event.key === "Escape"'));
  assert.ok(dialogSource.includes("OnlineRouteDialog"));
  assert.ok(dialogSource.includes("OnlineRoomMenu"));
  assert.ok(dialogSource.includes('document.addEventListener("pointerdown", dismissOutside, true)'));
  assert.ok(dialogSource.includes("rootRef.current?.contains(event.target)"));
  assert.ok(!lobbySource.includes("<OnlineRoomMenu>"));
  assert.ok(lobbySource.includes("<OnlineFriendInvite"));
  assert.ok(slotsSource.includes("event.target === event.currentTarget"));
  assert.ok(!matchSource.includes("<OnlineDismissibleLayer"));
});

test("ロビーのRealtime同期状態はルームメンバー見出し直下で折り返さない", () => {
  const lobbyLiveSource = readFileSync(new URL("../components/online-lobby-live.tsx", import.meta.url), "utf8");
  const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.ok(lobbyLiveSource.includes('<span className="lobby-sync-status">{connection}</span>'));
  assert.ok(!lobbyLiveSource.includes('<span className="sr-only">{connection}</span>'));
  assert.match(globalStyles, /\.lobby-sync-status\{[^}]*display:block[^}]*white-space:nowrap[^}]*\}/);
});

test("フレンド招待ダイアログのヘッダーは共通ヘッダーの白背景と固定寸法を引き継がない", () => {
  const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(globalStyles, /\.online-friend-invite-dialog>header\{[^}]*background:transparent[^}]*border:0[^}]*height:auto[^}]*padding:0[^}]*position:static[^}]*top:auto[^}]*z-index:auto[^}]*\}/);
});

test("共通ヘッダーはGitHub型のアクションメニューから管理とフレンド画面を開く", () => {
  const navigationSource = readFileSync(new URL("../components/site-navigation.tsx", import.meta.url), "utf8");
  const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.ok(navigationSource.includes('aria-haspopup="menu"'));
  assert.ok(navigationSource.includes('role="menu"'));
  assert.ok(navigationSource.includes("フレンド"));
  assert.ok(navigationSource.includes('event.key === "Escape"'));
  assert.ok(navigationSource.includes('document.addEventListener("pointerdown", closeOutside, true)'));
  assert.match(globalStyles, /\.site-action-menu-panel\{[^}]*position:absolute[^}]*right:0[^}]*\}/);
  assert.match(globalStyles, /\.site-header:has\(\.site-action-menu-trigger\[aria-expanded="true"\]\)\{z-index:20000\}/);
});

test("対戦待機状態の説明文は丸印用CSSに巻き込まれずダーク背景で表示される", () => {
  const roomSource = readFileSync(new URL("../app/rooms/[roomId]/page.tsx", import.meta.url), "utf8");
  const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.ok(roomSource.includes('className="room-status-indicator"'));
  assert.ok(!globalStyles.includes(".room-status>span{"));
  assert.match(globalStyles, /\.room-status\{[^}]*background:var\(--surface-raised\)[^}]*color:#fff[^}]*\}/);
  assert.match(globalStyles, /\.room-status-indicator\{[^}]*height:10px[^}]*width:10px[^}]*\}/);
});

test("両対戦者の準備完了でホスト操作を待たず自動開始する", () => {
  const readyFormSource = readFileSync(new URL("../components/room-deck-ready-form.tsx", import.meta.url), "utf8");
  const matchSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../supabase/migrations/20260903084329_auto_start_game_when_both_players_ready.sql", import.meta.url), "utf8");
  assert.ok(readyFormSource.includes("対戦者2名が準備完了すると、自動的に対戦が始まります。"));
  assert.ok(!matchSource.includes("デュエル開始"));
  assert.ok(migrationSource.includes("perform 1 from private.start_game_room_from_ready(p_room_id)"));
  assert.match(migrationSource, /if status = 'ready' then[\s\S]*status := 'playing'/);
});

test("準備完了の取り消し時も選択済みデッキIDを送信する", () => {
  const readyFormSource = readFileSync(new URL("../components/room-deck-ready-form.tsx", import.meta.url), "utf8");
  assert.ok(readyFormSource.includes('<input name="deckId" type="hidden" value={selectedDeckId} />'));
});

test("待機ルームのデッキ変更は自分の席のアイコン選択から即時snapshot更新を送信する", () => {
  const actionSource = readFileSync(new URL("../app/rooms/actions.ts", import.meta.url), "utf8");
  const readyFormSource = readFileSync(new URL("../components/room-deck-ready-form.tsx", import.meta.url), "utf8");
  const roomSource = readFileSync(new URL("../app/rooms/[roomId]/page.tsx", import.meta.url), "utf8");
  assert.ok(readyFormSource.includes("action={setRoomDeckAction}"));
  assert.ok(readyFormSource.includes('aria-label="使用デッキを変更"'));
  assert.ok(readyFormSource.includes("<CardArtwork imageUrl={deck.imageUrl}"));
  assert.ok(roomSource.includes("<RoomDeckSelect decks={playableDeckChoices}"));
  assert.match(actionSource, /export async function setRoomDeckAction[\s\S]*?p_ready: false/);
  assert.match(actionSource, /enterOnlineMatchSlotAction[\s\S]*?get_game_room_deck_labels[\s\S]*?set_game_room_ready[\s\S]*?p_ready: false/);
});

test("受付の公開設定はルームへ保存し、非公開時はデッキ情報だけ伏せる", () => {
  const slotsSource = readFileSync(new URL("../components/online-lobby-slots.tsx", import.meta.url), "utf8");
  const roomSource = readFileSync(new URL("../app/rooms/[roomId]/page.tsx", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../supabase/migrations/20260917200533_online_match_deck_visibility.sql", import.meta.url), "utf8");
  assert.ok(!slotsSource.includes("使用するデッキ"));
  assert.ok(slotsSource.includes("デッキを公開する"));
  assert.ok(slotsSource.includes('role="switch"'));
  assert.ok(roomSource.includes("const isDeckPublic = room.deck_is_public"));
  assert.ok(roomSource.includes('className="room-player-avatar'));
  assert.ok(roomSource.includes('className="room-deck-emblem">?</span>'));
  assert.ok(migrationSource.includes("add column if not exists deck_is_public boolean not null default true"));
  assert.ok(migrationSource.includes("case when v_room.deck_is_public then v_room.host_deck_snapshot ->> 'name' else '???' end"));
});

test("盤面取得RPCは直接テーブル権限に依存せず参加者確認済みの非公開関数を使う", () => {
  const migrationSource = readFileSync(new URL("../supabase/migrations/20260903085830_fix_authenticated_game_room_state_read.sql", import.meta.url), "utf8");
  const publicWrapper = migrationSource.slice(migrationSource.indexOf("create or replace function public.get_game_room_state"));
  assert.ok(migrationSource.includes("create or replace function private.get_game_room_state_impl"));
  assert.ok(migrationSource.includes("private.redact_game_room_state_for_current_user(p_room_id, rooms.state)"));
  assert.ok(publicWrapper.includes("from private.get_game_room_state_impl(p_room_id)"));
  assert.ok(!publicWrapper.includes("from public.game_rooms"));
});

test("オンライン盤面はローカル用の10枚未満警告で遮断されない", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.ok(boardSource.includes("if (!externalState && (cards.reduce"));
});

test("準備完了後は待機画面の下ではなく対戦専用ページへ移動する", () => {
  const actionSource = readFileSync(new URL("../app/rooms/actions.ts", import.meta.url), "utf8");
  const waitingSource = readFileSync(new URL("../app/rooms/[roomId]/page.tsx", import.meta.url), "utf8");
  const battleSource = readFileSync(new URL("../app/rooms/[roomId]/battle/page.tsx", import.meta.url), "utf8");
  const roomsSource = readFileSync(new URL("../app/rooms/page.tsx", import.meta.url), "utf8");
  assert.ok(actionSource.includes('data?.[0]?.status === "playing"'));
  assert.ok(actionSource.includes('redirect(`/rooms/${roomId}/battle`)'));
  assert.ok(waitingSource.includes('room.status === "playing" || room.status === "finished"'));
  assert.ok(waitingSource.includes('redirect(`/rooms/${room.id}/battle`)'));
  assert.ok(!waitingSource.includes("<OnlineMatchBoard"));
  assert.ok(battleSource.includes("<OnlineMatchBoard"));
  assert.ok(battleSource.includes('room.status === "waiting" || room.status === "ready"'));
  assert.ok(roomsSource.includes('href={`/rooms/${activeMatches[0].id}/battle`}'));
  assert.ok(roomsSource.includes('.eq("status", "playing")'));
});

test("公開ロビーの本人枠は待機中も対戦者としてデッキを変更でき、開始後は対戦へ戻る", () => {
  const slotsSource = readFileSync(new URL("../components/online-lobby-slots.tsx", import.meta.url), "utf8");
  const liveSource = readFileSync(new URL("../components/online-lobby-live.tsx", import.meta.url), "utf8");
  assert.ok(slotsSource.includes('router.push(`/rooms/${slot.game_room_id}/battle`)'));
  assert.ok(slotsSource.includes('myMatchIds.includes(slot.game_room_id)'));
  assert.ok(slotsSource.includes('disabled={activeSlot.player_count >= 2 && !myMatchIds.includes(activeSlot.game_room_id ?? "")}'));
  assert.ok(!liveSource.includes('.eq("status", "playing")'));
});

test("盤面保存は直列化し待機中の変更を最新1件へ集約する", () => {
  const source = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("const saveInFlightRef = useRef(false)"));
  assert.ok(source.includes("const pendingSaveRef = useRef<BoardState | null>(null)"));
  assert.ok(source.includes("if (saveInFlightRef.current) return"));
  assert.ok(source.includes("while (pendingSaveRef.current)"));
  assert.ok(!source.includes('onStateChange={isSpectator ? undefined : (next) => void saveState(next)}'));
});
test("オンライン対戦は相手を展開し引用ゾーンにマナを表示して開始する", () => {
  const boardSource = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  const matchSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(boardSource.includes('initialOpponentCollapsed = true'));
  assert.ok(boardSource.includes('initialOpponentAuxiliaryZone = "hand"'));
  assert.ok(matchSource.includes('initialOpponentCollapsed={false}'));
  assert.ok(matchSource.includes('initialOpponentAuxiliaryZone="mana"'));
});

test("対戦終了後は対戦開始元のロビーページへ戻る", () => {
  const battleSource = readFileSync(new URL("../app/rooms/[roomId]/battle/page.tsx", import.meta.url), "utf8");
  const matchSource = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  assert.ok(battleSource.includes('from("online_match_slots").select("lobby_id").eq("game_room_id", roomId).maybeSingle()'));
  assert.ok(battleSource.includes('returnLobbyId={matchSlot?.lobby_id ?? null}'));
  assert.ok(matchSource.includes('href={returnLobbyId ? `/rooms/lobbies/${returnLobbyId}` : "/rooms"}'));
  assert.ok(!matchSource.includes('className="secondary-button" href="/rooms">ルームへ戻る'));
});

