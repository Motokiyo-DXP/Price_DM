import { moveDefaults, type CardFace, type PlayZone, type ShieldPlacementMarker } from "./playfield-interactions.ts";

export type PlayerId = "p1" | "p2";
export type DeckCard = { canonicalCardId: number; name: string; quantity: number; sortOrder: number; imageUrl: string | null; cost?: number | null; civilizations?: string[]; cardTypes?: string[] };
export type CardInstance = {
  instanceId: string;
  canonicalCardId: number;
  name: string;
  imageUrl: string | null;
  cost?: number | null;
  civilizations?: string[];
  cardTypes?: string[];
  face: CardFace;
  tapped: boolean;
  shieldMarker: ShieldPlacementMarker | null;
  markers?: CardMarker[];
  stackId?: string | null;
  stackOrder?: number | null;
  stackLayout?: "diagonal" | "spread" | null;
  stackPlacement?: "top" | "bottom" | null;
  attachedToStackId?: string | null;
};
export type CardMarker = "cannot_attack" | "cannot_block" | "keep_tapped" | "removal_resistance" | "ignore_ability" | "meta_warning" | "hyper_mode" | "blocker" | "power_up" | "power_down" | "speed_attacker" | "mach_fighter" | "slayer" | "shield_force" | "summoning_sickness" | "just_diver" | "cannot_be_chosen" | "cannot_be_attacked" | "cannot_be_blocked";
export type PlayerState = Record<PlayZone, CardInstance[]>;
export function findAttachedSpreadStackId(cards: CardInstance[], verticalStackId: string): string | null {
  return cards.find((card) => card.attachedToStackId === verticalStackId && card.stackLayout === "spread" && card.stackId)?.stackId ?? null;
}

export function stackOnHorizontalRoot(cards: CardInstance[], target: CardInstance, movingIds: ReadonlySet<string>, face: CardFace, placement: "top" | "bottom"): CardInstance[] | null {
  if (!target.stackId || target.stackLayout !== "spread" || target.attachedToStackId || !cards.some((card) => card.stackId === target.stackId && card.instanceId !== target.instanceId && !movingIds.has(card.instanceId))) return null;
  const verticalId = `vertical-${target.stackId}`;
  const moving = cards.filter((card) => movingIds.has(card.instanceId)).sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
  const vertical = placement === "top" ? [target, ...moving] : [...moving, target];
  const members = new Map(vertical.map((card, index) => [card.instanceId, { ...card, face: movingIds.has(card.instanceId) ? face : card.face, markers: index === vertical.length - 1 ? card.markers : [], stackId: verticalId, stackOrder: index, stackLayout: "diagonal" as const, stackPlacement: placement, attachedToStackId: null }]));
  return cards.map((card) => members.get(card.instanceId) ?? (card.stackId === target.stackId ? { ...card, attachedToStackId: verticalId } : card));
}

export function hasConnectedStack(cards: CardInstance[], card: CardInstance): boolean {
  if (!card.stackId) return false;
  return card.stackLayout === "spread"
    ? Boolean(card.attachedToStackId && cards.some((member) => member.stackId === card.attachedToStackId))
    : cards.some((member) => member.attachedToStackId === card.stackId && member.stackLayout === "spread");
}
export type BoardState = {
  players: Record<PlayerId, PlayerState>;
  revealPublic?: Record<PlayerId, boolean>;
  turn: number;
  activePlayer: PlayerId;
  shieldPlacementOrder: number | Record<PlayerId, number>;
  notifications?: BoardNotification[];
  turnRequest?: { requestedBy: PlayerId; status: "pending" | "held" } | null;
  inspection?: { cardId: string; owner: PlayerId; viewer: PlayerId } | null;
};
export type BoardNotification = {
  id: string;
  recipient: PlayerId;
  message: string;
  createdAt: number;
  revealedCard?: CardInstance;
};

const validCivilizations = new Set(["light", "water", "darkness", "fire", "nature", "zero"]);

const cardCostCorrections = new Map<string, number>([
  ["ヨビニオン・マルル", 4],
  ["天災 デドダム", 3],
]);

export function resolveCardCost(name: string, cost?: number | null) {
  return typeof cost === "number" ? cost : cardCostCorrections.get(name.trim()) ?? null;
}

export function resolveCardCivilizations(name: string, civilizations: string[] = []) {
  void name;
  return [...new Set(civilizations.map((value) => value.trim().toLowerCase()).filter((value) => validCivilizations.has(value)))];
}

export function isMulticolorCard(card: Pick<CardInstance, "civilizations"> & Partial<Pick<CardInstance, "name">>) {
  return resolveCardCivilizations(card.name ?? "", card.civilizations ?? []).length > 1;
}

export function shuffleCards<T>(items: T[], random = Math.random) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function emptyPlayer(): PlayerState {
  return { deck: [], deckInspection: [], hand: [], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [] };
}

export function inspectDeckCards(current: BoardState, owner: PlayerId, count: number | "max", takeFrom: "top" | "bottom"): BoardState {
  const deck = current.players[owner].deck;
  const amount = count === "max" ? deck.length : Math.max(0, Math.min(count, deck.length));
  if (amount === 0) return current;
  const split = takeFrom === "top" ? amount : deck.length - amount;
  const inspected = takeFrom === "top" ? deck.slice(0, amount) : deck.slice(split);
  const remaining = takeFrom === "top" ? deck.slice(amount) : deck.slice(0, split);
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], deck: remaining, deckInspection: [...current.players[owner].deckInspection, ...inspected] } } };
}

export function closeMaxDeckInspection(current: BoardState, owner: PlayerId, topIds: readonly string[], bottomIds: readonly string[], random = Math.random): BoardState {
  const player = current.players[owner];
  const placed = new Set([...topIds, ...bottomIds]);
  const byId = new Map(player.deck.map((card) => [card.instanceId, card]));
  const top = topIds.flatMap((id) => byId.get(id) ?? []);
  const bottom = bottomIds.flatMap((id) => byId.get(id) ?? []);
  const remainder = shuffleCards(player.deckInspection.filter((card) => !placed.has(card.instanceId)), random);
  const unrelated = player.deck.filter((card) => !placed.has(card.instanceId));
  return { ...current, players: { ...current.players, [owner]: { ...player, deck: [...top, ...remainder, ...unrelated, ...bottom], deckInspection: [] } } };
}

function dealInstances(instances: CardInstance[], random = Math.random): PlayerState {
  const shuffled = shuffleCards(instances.map((card) => ({ ...card, face: "face_down" as CardFace, tapped: false, shieldMarker: null, markers: [], stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null })), random);
  const player = emptyPlayer();
  player.shield = shuffled.slice(0, 5);
  player.hand = shuffled.slice(5, 10).map((card) => ({ ...card, face: "owner_only" as CardFace }));
  player.deck = shuffled.slice(10);
  return player;
}

function makePlayer(cards: DeckCard[], playerId: PlayerId, random = Math.random): PlayerState {
  return dealInstances(cards.flatMap((card, deckEntryIndex) => Array.from({ length: card.quantity }, (_, copy) => ({
    instanceId: `${playerId}-${card.canonicalCardId}-${deckEntryIndex}-${copy}`,
    canonicalCardId: card.canonicalCardId,
    name: card.name,
    imageUrl: card.imageUrl,
    cost: resolveCardCost(card.name, card.cost),
    civilizations: resolveCardCivilizations(card.name, card.civilizations ?? []),
    cardTypes: card.cardTypes ?? [],
    face: "face_down" as CardFace,
    tapped: false,
    shieldMarker: null,
    markers: [], stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null,
  }))), random);
}

export function initialBoard(cards: DeckCard[], random = Math.random): BoardState {
  return initialOnlineBoard(cards, cards, random);
}

export function initialOnlineBoard(hostCards: DeckCard[], guestCards: DeckCard[], random = Math.random): BoardState {
  return {
    players: { p1: makePlayer(hostCards, "p1", random), p2: makePlayer(guestCards, "p2", random) },
    revealPublic: { p1: false, p2: false },
    turn: 1,
    activePlayer: "p1",
    shieldPlacementOrder: { p1: 1, p2: 1 },
    notifications: [],
    turnRequest: null,
    inspection: null,
  };
}

export function resetBoard(current: BoardState, random = Math.random): BoardState {
  const resetPlayer = (playerId: PlayerId) => dealInstances(Object.values(current.players[playerId]).flat(), random);
  return { players: { p1: resetPlayer("p1"), p2: resetPlayer("p2") }, revealPublic: { p1: false, p2: false }, turn: 1, activePlayer: "p1", shieldPlacementOrder: { p1: 1, p2: 1 }, notifications: [], turnRequest: null, inspection: null };
}

export function advanceTurn(current: BoardState): BoardState {
  const nextPlayer: PlayerId = current.activePlayer === "p1" ? "p2" : "p1";
  return {
    ...current,
    activePlayer: nextPlayer,
    turn: current.turn + (nextPlayer === "p1" ? 1 : 0),
    turnRequest: null,
  };
}

export function toggleLegacyCardTapState(
  current: BoardState,
  owner: PlayerId,
  zone: PlayZone,
  cardId: string,
  options: Readonly<{ clearKeepTappedOnUntap: boolean }>,
): BoardState {
  const cards = current.players[owner][zone];
  if (!cards.some((card) => card.instanceId === cardId)) return current;
  return {
    ...current,
    players: {
      ...current.players,
      [owner]: {
        ...current.players[owner],
        [zone]: cards.map((card) => card.instanceId === cardId
          ? {
            ...card,
            tapped: !card.tapped,
            ...(card.tapped && options.clearKeepTappedOnUntap
              ? { markers: card.markers?.filter((marker) => marker !== "keep_tapped") }
              : {}),
          }
          : card),
      },
    },
  };
}

export function setCardMarker(current: BoardState, owner: PlayerId, zone: PlayZone, cardId: string, marker: CardMarker, enabled: boolean): BoardState {
  const cards = current.players[owner][zone];
  const target = cards.find((card) => card.instanceId === cardId);
  if (!target) return current;
  const markers = target.markers ?? [];
  const hasMarker = markers.includes(marker);
  if (hasMarker === enabled) return current;
  return {
    ...current,
    players: {
      ...current.players,
      [owner]: {
        ...current.players[owner],
        [zone]: cards.map((card) => card.instanceId === cardId
          ? { ...card, markers: enabled ? [...markers, marker] : markers.filter((item) => item !== marker) }
          : card),
      },
    },
  };
}

export function clearCardMarkers(current: BoardState, owner: PlayerId, zone: PlayZone, cardId: string): BoardState {
  const cards = current.players[owner][zone];
  const target = cards.find((card) => card.instanceId === cardId);
  if (!target?.markers?.length) return current;
  return {
    ...current,
    players: {
      ...current.players,
      [owner]: {
        ...current.players[owner],
        [zone]: cards.map((card) => card.instanceId === cardId ? { ...card, markers: [] } : card),
      },
    },
  };
}

export function changeSlayerCount(current: BoardState, owner: PlayerId, zone: PlayZone, cardId: string, delta: -1 | 1): BoardState {
  const cards = current.players[owner][zone];
  const target = cards.find((card) => card.instanceId === cardId);
  if (!target) return current;
  const markers = target.markers ?? [];
  const index = markers.lastIndexOf("slayer");
  if (delta < 0 && index < 0) return current;
  const nextMarkers = delta > 0 ? [...markers, "slayer" as CardMarker] : markers.filter((_, position) => position !== index);
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: cards.map((card) => card.instanceId === cardId ? { ...card, markers: nextMarkers } : card) } } };
}

export function shuffleSelectedCards(current: BoardState, ids: ReadonlySet<string>, random = Math.random): BoardState {
  if (ids.size < 2) return current;
  const stackId = `stack-${Date.now()}`;
  const players = Object.fromEntries(Object.entries(current.players).map(([playerId, player]) => [playerId, Object.fromEntries(Object.entries(player).map(([zone, cards]) => {
    const selected = cards.filter((card) => ids.has(card.instanceId));
    if (selected.length < 2) return [zone, cards];
    const shuffled = shuffleCards(selected, random).map((card, index) => ({ ...card, face: "face_down" as CardFace, stackId, stackOrder: index }));
    let index = 0;
    return [zone, cards.map((card) => ids.has(card.instanceId) ? shuffled[index++] : card)];
  }))])) as BoardState["players"];
  return { ...current, players };
}

export function bundleSelectedCards(current: BoardState, ids: ReadonlySet<string>): BoardState {
  if (ids.size < 2) return current;
  const stackId = `stack-${Date.now()}`;
  let changed = false;
  const players = Object.fromEntries(Object.entries(current.players).map(([playerId, player]) => [playerId, Object.fromEntries(Object.entries(player).map(([zone, cards]) => {
    const selected = cards.filter((card) => ids.has(card.instanceId));
    if (selected.length < 2) return [zone, cards];
    changed = true;
    let stackOrder = 0;
    return [zone, cards.map((card) => ids.has(card.instanceId)
      ? { ...card, markers: stackOrder === selected.length - 1 ? card.markers : [], stackId, stackOrder: stackOrder++, stackLayout: "diagonal" as const, stackPlacement: "top" as const }
      : card)];
  }))])) as BoardState["players"];
  return changed ? { ...current, players } : current;
}

export function shuffleStackCards(current: BoardState, owner: PlayerId, zone: PlayZone, stackId: string, random = Math.random): BoardState {
  const source = current.players[owner][zone];
  const members = source.filter((card) => card.stackId === stackId);
  if (members.length < 2) return current;
  const shuffled = shuffleCards(members, random).map((card, index) => ({ ...card, face: "face_down" as CardFace, stackOrder: index }));
  let memberIndex = 0;
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: source.map((card) => card.stackId === stackId ? shuffled[memberIndex++] : card) } } };
}

export function flipStackCards(current: BoardState, owner: PlayerId, zone: PlayZone, stackId: string): BoardState {
  const source = current.players[owner][zone];
  const members = source.filter((card) => card.stackId === stackId);
  if (members.length === 0) return current;
  const face: CardFace = members.every((card) => card.face === "face_down") ? "face_up" : "face_down";
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: source.map((card) => card.stackId === stackId ? { ...card, face } : card) } } };
}

export function runYobinion(current: BoardState, owner: PlayerId, sourceId: string, dragonOnly = false, random = Math.random): BoardState {
  const source = Object.values(current.players[owner]).flat().find((card) => card.instanceId === sourceId && resolveCardCost(card.name, card.cost) !== null);
  if (!source) return current;
  const sourceCost = resolveCardCost(source.name, source.cost);
  if (sourceCost === null) return current;
  const deck = current.players[owner].deck;
  const matchIndex = deck.findIndex((card) => {
    const types = card.cardTypes ?? [];
    const isCreature = types.some((type) => type.includes("クリーチャー"));
    const candidateCost = resolveCardCost(card.name, card.cost);
    return candidateCost !== null && candidateCost < sourceCost && isCreature && (!dragonOnly || card.name.includes("ドラゴン") || types.some((type) => type.includes("ドラゴン")));
  });
  if (matchIndex < 0) return current;
  const revealed = deck.slice(0, matchIndex);
  const match = { ...deck[matchIndex], cost: resolveCardCost(deck[matchIndex].name, deck[matchIndex].cost), face: "face_up" as CardFace, tapped: false, shieldMarker: null, stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null };
  const stackId = `yobinion-${Date.now()}-${sourceId}`;
  const remainder = shuffleCards(revealed, random).map((card, index) => ({
    ...card,
    face: "face_down" as CardFace,
    tapped: false,
    shieldMarker: null,
    stackId,
    stackOrder: index,
    stackLayout: "diagonal" as const,
    stackPlacement: "top" as const,
  }));
  const createdAt = Date.now();
  const message = `ヨビニオン：${match.name}をバトルゾーンへ移動しました（確認${matchIndex + 1}枚）`;
  const notifications = (["p1", "p2"] as const).reduce<BoardNotification[]>((items, recipient) => [
    ...items,
    { id: `yobinion-${createdAt}-${owner}-${recipient}`, recipient, message, createdAt, revealedCard: match },
  ], current.notifications ?? []);
  return {
    ...current,
    notifications,
    players: {
      ...current.players,
      [owner]: {
        ...current.players[owner],
        deck: [...deck.slice(matchIndex + 1), ...remainder],
        battle: [...current.players[owner].battle, match],
      },
    },
  };
}

export function drawRandomCard(current: BoardState, owner: PlayerId, random = Math.random): BoardState {
  void random;
  const deck = current.players[owner].deck;
  if (deck.length === 0) return current;
  const card = deck[0];
  return {
    ...current,
    players: {
      ...current.players,
      [owner]: {
        ...current.players[owner],
        deck: deck.slice(1),
        hand: [...current.players[owner].hand, { ...card, face: "owner_only", tapped: false, shieldMarker: null }],
      },
    },
  };
}

export function resolveDraggedCardIds(cards: readonly CardInstance[], cardId: string): Set<string> {
  const dragged = cards.find((card) => card.instanceId === cardId);
  if (!dragged?.stackId) return new Set([cardId]);
  return new Set(cards.filter((card) => card.stackId === dragged.stackId).map((card) => card.instanceId));
}

export function countZoneCards(cards: readonly CardInstance[]): number {
  return cards.filter((card, index) => !card.stackId || cards.findIndex((member) => member.stackId === card.stackId) === index).length;
}

export function unbundleStack(current: BoardState, owner: PlayerId, zone: PlayZone, stackId: string): BoardState {
  const cards = current.players[owner][zone];
  if (!cards.some((card) => card.stackId === stackId)) return current;
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: cards.map((card) => card.stackId === stackId
    ? { ...card, stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null }
    : card) } } };
}

export function detachCardFromStack(current: BoardState, owner: PlayerId, zone: PlayZone, cardId: string): BoardState {
  const source = current.players[owner][zone];
  const dragged = source.find((card) => card.instanceId === cardId);
  if (!dragged?.stackId) return current;
  const remaining = source.filter((card) => card.instanceId !== cardId);
  const detached = { ...dragged, stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null, attachedToStackId: null };
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: [
    ...remaining.map((card) => card.stackId === dragged.stackId
      && remaining.filter((member) => member.stackId === card.stackId).length === 1
      && !hasConnectedStack(remaining, card)
      ? { ...card, stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null }
      : card),
    detached,
  ] } } };
}

export function moveCardsBetweenZones(
  current: BoardState,
  owner: PlayerId,
  from: PlayZone,
  to: PlayZone,
  ids: ReadonlySet<string>,
  placement: "top" | "bottom" = "bottom",
  addSummoningSickness = false,
): BoardState {
  if (from === to || ids.size === 0) return current;
  const player = current.players[owner];
  const moving = player[from].filter((card) => ids.has(card.instanceId));
  if (moving.length === 0) return current;
  const movingStackId = moving[0].stackId;
  const preservesCompleteStack = Boolean(
    movingStackId
    && moving.every((card) => card.stackId === movingStackId)
    && player[from].filter((card) => card.stackId === movingStackId).every((card) => ids.has(card.instanceId)),
  );
  if (preservesCompleteStack) moving.sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
  const orders = typeof current.shieldPlacementOrder === "number"
    ? { p1: current.shieldPlacementOrder, p2: current.shieldPlacementOrder }
    : current.shieldPlacementOrder;
  const moved = moving.map((card, index) => {
    const defaults = moveDefaults(from, to, { turn: current.turn, shieldPlacementOrder: orders[owner] });
    const unbundleInHand = to === "hand" && Boolean(card.stackId);
    const unbundleInDeck = to === "deck" && Boolean(card.stackId);
    return {
      ...card,
      face: unbundleInHand || unbundleInDeck ? "face_up" as CardFace : defaults.face,
      tapped: to === "mana" && isMulticolorCard(card),
      shieldMarker: defaults.shieldMarker ? { ...defaults.shieldMarker, order: orders[owner] + index } : null,
      markers: addSummoningSickness && to === "battle" && from !== "battle"
        ? ["summoning_sickness" as CardMarker]
        : [],
      stackId: preservesCompleteStack && !unbundleInHand && !unbundleInDeck ? card.stackId : null,
      stackOrder: preservesCompleteStack && !unbundleInHand && !unbundleInDeck ? card.stackOrder : null,
      stackLayout: preservesCompleteStack && !unbundleInHand && !unbundleInDeck ? card.stackLayout : null,
      stackPlacement: preservesCompleteStack && !unbundleInHand && !unbundleInDeck ? card.stackPlacement : null,
      attachedToStackId: null,
    };
  });
  const destination = player[to];
  const remaining = player[from].filter((card) => !ids.has(card.instanceId));
  return {
    ...current,
    shieldPlacementOrder: to === "shield" ? { ...orders, [owner]: orders[owner] + moved.length } : orders,
    players: {
      ...current.players,
      [owner]: {
        ...player,
        [from]: remaining.map((card) =>
          card.stackId && remaining.filter((member) => member.stackId === card.stackId).length === 1 && !hasConnectedStack(remaining, card)
            ? { ...card, stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null }
            : card),
        [to]: placement === "top" ? [...moved, ...destination] : [...destination, ...moved],
      },
    },
  };
}

export function toggleRevealPublic(current: BoardState, owner: PlayerId): BoardState {
  const nextPublic = !current.revealPublic?.[owner];
  const next = { ...current, revealPublic: { p1: current.revealPublic?.p1 ?? false, p2: current.revealPublic?.p2 ?? false, [owner]: nextPublic } };
  if (!nextPublic) return next;
  const recipient: PlayerId = owner === "p1" ? "p2" : "p1";
  return { ...next, notifications: [...(current.notifications ?? []), { id: `${Date.now()}-reveal-${recipient}`, recipient, message: "相手が仮置き場のカードを公開しました", createdAt: Date.now() }].slice(-20) };
}

export function untapAllCards(current: BoardState, owner: PlayerId): BoardState {
  let changed = false;
  const player = Object.fromEntries(Object.entries(current.players[owner]).map(([zone, cards]) => [zone, cards.map((card) => {
    if (!card.tapped || card.markers?.includes("keep_tapped")) return card;
    changed = true;
    return { ...card, tapped: false };
  })])) as PlayerState;
  return changed ? { ...current, players: { ...current.players, [owner]: player } } : current;
}

export function untapZoneCards(current: BoardState, owner: PlayerId, zone: PlayZone): BoardState {
  const source = current.players[owner][zone];
  // 全てアンタップなら全タップ。混在または全タップならアンタップを優先する。
  const tapAll = source.length > 0 && source.every((card) => !card.tapped);
  const cards = source.map((card) => tapAll
    ? { ...card, tapped: true }
    : card.tapped && !card.markers?.includes("keep_tapped") ? { ...card, tapped: false } : card);
  return { ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: cards } } };
}
