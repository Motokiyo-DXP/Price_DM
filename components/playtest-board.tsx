"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  classifyPointerGesture,
  moveDefaults,
  type CardFace,
  type PlayZone,
  type ShieldPlacementMarker,
} from "@/lib/playfield-interactions";
import { CardArtwork } from "@/components/card-artwork";

export type PlayerId = "p1" | "p2";
export type DeckCard = { canonicalCardId: number; name: string; quantity: number; sortOrder: number; imageUrl: string | null };
export type CardInstance = {
  instanceId: string;
  canonicalCardId: number;
  name: string;
  imageUrl: string | null;
  face: CardFace;
  tapped: boolean;
  shieldMarker: ShieldPlacementMarker | null;
};
export type PlayerState = Record<PlayZone, CardInstance[]>;
export type BoardState = {
  players: Record<PlayerId, PlayerState>;
  turn: number;
  activePlayer: PlayerId;
  shieldPlacementOrder: number;
};

const playerIds: PlayerId[] = ["p1", "p2"];
const visibleZones: PlayZone[] = ["battle", "mana", "shield", "graveyard", "hand"];
const zoneLabels: Record<PlayZone, string> = {
  deck: "山札", hand: "手札", shield: "シールド", mana: "マナ",
  battle: "バトルゾーン", graveyard: "墓地", hyperspatial: "超次元",
  gr: "GR", reveal: "公開領域",
};

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function emptyPlayer(): PlayerState {
  return { deck: [], hand: [], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], reveal: [] };
}

function makePlayer(cards: DeckCard[], playerId: PlayerId): PlayerState {
  const instances = shuffle(cards.flatMap((card) => Array.from({ length: card.quantity }, (_, copy) => ({
    instanceId: `${playerId}-${card.canonicalCardId}-${copy}`,
    canonicalCardId: card.canonicalCardId,
    name: card.name,
    imageUrl: card.imageUrl,
    face: "face_down" as CardFace,
    tapped: false,
    shieldMarker: null,
  }))));
  const player = emptyPlayer();
  player.shield = instances.slice(0, 5);
  player.hand = instances.slice(5, 10).map((card) => ({ ...card, face: "owner_only" }));
  player.deck = instances.slice(10);
  return player;
}

export function initialBoard(cards: DeckCard[]): BoardState {
  return {
    players: { p1: makePlayer(cards, "p1"), p2: makePlayer(cards, "p2") },
    turn: 1,
    activePlayer: "p1",
    shieldPlacementOrder: 1,
  };
}

export function initialOnlineBoard(hostCards: DeckCard[], guestCards: DeckCard[]): BoardState {
  return {
    players: { p1: makePlayer(hostCards, "p1"), p2: makePlayer(guestCards, "p2") },
    turn: 1,
    activePlayer: "p1",
    shieldPlacementOrder: 1,
  };
}

type CardViewProps = {
  card: CardInstance;
  owner: PlayerId;
  view: PlayerId;
  zone: PlayZone;
  onMove: (owner: PlayerId, from: PlayZone, cardId: string, to: PlayZone) => void;
  onTap: (owner: PlayerId, zone: PlayZone, cardId: string) => void;
  onDetails: (card: CardInstance) => void;
  onOptions: (owner: PlayerId, zone: PlayZone, card: CardInstance) => void;
};

function CardView({ card, owner, view, zone, onMove, onTap, onDetails, onOptions }: CardViewProps) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const longPress = useRef<number | null>(null);
  const tapTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const visible = card.face === "face_up" || (card.face === "owner_only" && owner === view);

  function clearLongPress() {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
  }

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    start.current = { x: event.clientX, y: event.clientY, at: performance.now() };
    longPressed.current = false;
    longPress.current = window.setTimeout(() => {
      longPressed.current = true;
      onDetails(card);
    }, 500);
  }

  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    const distance = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
    if (distance > 8) clearLongPress();
  }

  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    clearLongPress();
    if (!start.current || longPressed.current) {
      start.current = null;
      return;
    }
    const distance = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
    const gesture = classifyPointerGesture({ durationMs: performance.now() - start.current.at, distancePx: distance });
    start.current = null;
    if (gesture === "drag") {
      const target = document.elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest<HTMLElement>("[data-drop-zone]"))
        .find((element) => element?.dataset.dropOwner === owner && element.dataset.dropZone !== zone);
      const targetZone = target?.dataset.dropZone as PlayZone | undefined;
      if (targetZone) onMove(owner, zone, card.instanceId, targetZone);
      return;
    }
    if (gesture === "tap") {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => onTap(owner, zone, card.instanceId), 260);
    }
  }

  function doubleClick() {
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    onOptions(owner, zone, card);
  }

  return (
    <button
      aria-label={`${visible ? card.name : "裏向きカード"}${card.tapped ? "、タップ中" : ""}`}
      className={`play-card ${visible ? "face-up" : "face-down"} ${card.tapped ? "tapped" : ""}`}
      onDoubleClick={doubleClick}
      onPointerCancel={() => {
        clearLongPress();
        start.current = null;
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      type="button"
    >
      {visible ? <CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="70px" /> : <span>DM</span>}
      {card.shieldMarker ? <small>追加{card.shieldMarker.order}</small> : null}
    </button>
  );
}

type ZoneProps = CardViewProps extends infer _T ? {
  owner: PlayerId; view: PlayerId; zone: PlayZone; cards: CardInstance[];
  onMove: CardViewProps["onMove"]; onTap: CardViewProps["onTap"];
  onDetails: CardViewProps["onDetails"]; onOptions: CardViewProps["onOptions"];
} : never;

function Zone({ owner, view, zone, cards, onMove, onTap, onDetails, onOptions }: ZoneProps) {
  return (
    <section className={`play-zone zone-${zone}`} data-drop-owner={owner} data-drop-zone={zone}>
      <header><strong>{zoneLabels[zone]}</strong><span>{cards.length}</span></header>
      <div className="play-zone-cards">
        {cards.map((card) => <CardView key={card.instanceId} card={card} owner={owner} view={view} zone={zone} onMove={onMove} onTap={onTap} onDetails={onDetails} onOptions={onOptions} />)}
      </div>
    </section>
  );
}

export function PlaytestBoard({ cards, deckName, externalState, localPlayer, connectionLabel, onStateChange }: { cards: DeckCard[]; deckName: string; externalState?: BoardState; localPlayer?: PlayerId; connectionLabel?: string; onStateChange?: (state: BoardState) => void }) {
  const [board, setBoard] = useState<BoardState>(() => externalState ?? initialBoard(cards));
  const [history, setHistory] = useState<BoardState[]>([]);
  const [view, setView] = useState<PlayerId>(localPlayer ?? "p1");
  const [detail, setDetail] = useState<CardInstance | null>(null);
  const [menu, setMenu] = useState<{ owner: PlayerId; zone: PlayZone; card: CardInstance } | null>(null);
  const displayPlayers = view === "p1" ? [...playerIds].reverse() : [...playerIds];

  useEffect(() => {
    if (externalState) setBoard(externalState);
  }, [externalState]);

  function commit(update: (current: BoardState) => BoardState) {
    setBoard((current) => {
      const next = update(current);
      if (next === current) return current;
      if (!onStateChange) setHistory((items) => [...items.slice(-49), current]);
      onStateChange?.(next);
      return next;
    });
  }

  function moveCard(owner: PlayerId, from: PlayZone, cardId: string, to: PlayZone) {
    if (localPlayer && owner !== localPlayer) return;
    commit((current) => {
      const source = current.players[owner][from];
      const card = source.find((item) => item.instanceId === cardId);
      if (!card) return current;
      const defaults = moveDefaults(from, to, { turn: current.turn, shieldPlacementOrder: current.shieldPlacementOrder });
      return {
        ...current,
        shieldPlacementOrder: to === "shield" ? current.shieldPlacementOrder + 1 : current.shieldPlacementOrder,
        players: {
          ...current.players,
          [owner]: {
            ...current.players[owner],
            [from]: source.filter((item) => item.instanceId !== cardId),
            [to]: [...current.players[owner][to], { ...card, face: defaults.face, tapped: false, shieldMarker: defaults.shieldMarker }],
          },
        },
      };
    });
    setMenu(null);
  }

  function toggleTap(owner: PlayerId, zone: PlayZone, cardId: string) {
    if (localPlayer && owner !== localPlayer) return;
    if (zone === "deck" || zone === "hand" || zone === "shield") return;
    commit((current) => ({ ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: current.players[owner][zone].map((card) => card.instanceId === cardId ? { ...card, tapped: !card.tapped } : card) } } }));
  }

  function draw(owner: PlayerId) {
    if (localPlayer && owner !== localPlayer) return;
    const card = board.players[owner].deck[0];
    if (card) moveCard(owner, "deck", card.instanceId, "hand");
  }

  function shuffleDeck(owner: PlayerId) {
    if (localPlayer && owner !== localPlayer) return;
    commit((current) => ({ ...current, players: { ...current.players, [owner]: { ...current.players[owner], deck: shuffle(current.players[owner].deck) } } }));
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setBoard(previous);
    setHistory((items) => items.slice(0, -1));
  }

  function nextTurn() {
    commit((current) => ({ ...current, turn: current.turn + 1, activePlayer: current.activePlayer === "p1" ? "p2" : "p1" }));
  }

  if (cards.reduce((sum, card) => sum + card.quantity, 0) < 10) {
    return <div className="history-empty"><strong>カードが足りません</strong><p>初期手札とシールドを作るため、10枚以上で一人回しを開始してください。</p></div>;
  }

  return (
    <div className="playtest-board">
      <div className="playtest-toolbar">
        <div><strong>{deckName}</strong><small>ターン {board.turn}・{board.activePlayer === "p1" ? "プレイヤー1" : "プレイヤー2"}{connectionLabel ? `・${connectionLabel}` : ""}</small></div>
        <div>{!onStateChange ? <button className="secondary-button" disabled={history.length === 0} onClick={undo} type="button">↶ Undo</button> : null}{!localPlayer ? <button className="secondary-button" onClick={() => setView((current) => current === "p1" ? "p2" : "p1")} type="button">⇅ 視点を入れ替える</button> : null}<button className="button" onClick={nextTurn} type="button">ターン終了</button></div>
      </div>

      {displayPlayers.map((playerId) => <section className={`player-field ${playerId === view ? "current-view" : "opponent-view"}`} key={playerId}>
        <div className="player-field-heading"><strong>{playerId === "p1" ? "プレイヤー1" : "プレイヤー2"}</strong><span>{playerId === view ? "操作視点" : "相手側"}</span></div>
        <div className="field-main">
          <div className="field-zones">{visibleZones.filter((zone) => zone !== "hand").map((zone) => <Zone key={zone} owner={playerId} view={view} zone={zone} cards={board.players[playerId][zone]} onMove={moveCard} onTap={toggleTap} onDetails={setDetail} onOptions={(owner, cardZone, card) => setMenu({ owner, zone: cardZone, card })} />)}</div>
          <aside className="deck-stack" data-drop-owner={playerId} data-drop-zone="deck"><button disabled={Boolean(localPlayer && playerId !== localPlayer)} onDoubleClick={() => setMenu({ owner: playerId, zone: "deck", card: board.players[playerId].deck[0] ?? { instanceId: "deck", canonicalCardId: 0, name: "山札", imageUrl: null, face: "face_down", tapped: false, shieldMarker: null } })} type="button"><span>DM</span><strong>山札 {board.players[playerId].deck.length}</strong></button><div><button disabled={Boolean(localPlayer && playerId !== localPlayer)} onClick={() => draw(playerId)} type="button">ドロー</button><button disabled={Boolean(localPlayer && playerId !== localPlayer)} onClick={() => shuffleDeck(playerId)} type="button">シャッフル</button></div></aside>
        </div>
        <Zone owner={playerId} view={view} zone="hand" cards={board.players[playerId].hand} onMove={moveCard} onTap={toggleTap} onDetails={setDetail} onOptions={(owner, cardZone, card) => setMenu({ owner, zone: cardZone, card })} />
      </section>)}

      {detail ? <div className="play-modal-backdrop" role="presentation" onClick={() => setDetail(null)}><section aria-modal="true" className="play-modal" onClick={(event) => event.stopPropagation()} role="dialog"><p className="eyebrow">カード詳細</p><h2>{detail.name}</h2><CardArtwork className="card-artwork-detail" imageUrl={detail.imageUrl} name={detail.name} sizes="384px" /><button className="button" onClick={() => setDetail(null)} type="button">閉じる</button></section></div> : null}
      {menu ? <div className="play-modal-backdrop" role="presentation" onClick={() => setMenu(null)}><section aria-modal="true" className="play-modal" onClick={(event) => event.stopPropagation()} role="dialog"><p className="eyebrow">操作</p><h2>{menu.zone === "deck" ? "山札" : menu.card.name}</h2>{menu.zone === "deck" ? <div className="play-option-grid"><button onClick={() => { draw(menu.owner); setMenu(null); }} type="button">ドロー</button><button onClick={() => { shuffleDeck(menu.owner); setMenu(null); }} type="button">シャッフル</button><button disabled type="button">ヨビニオン（準備中）</button><button disabled type="button">メクレイド（準備中）</button></div> : <div className="play-option-grid">{visibleZones.filter((zone) => zone !== menu.zone).map((zone) => <button key={zone} onClick={() => moveCard(menu.owner, menu.zone, menu.card.instanceId, zone)} type="button">{zoneLabels[zone]}へ</button>)}</div>}<button className="secondary-button" onClick={() => setMenu(null)} type="button">キャンセル</button></section></div> : null}
    </div>
  );
}
