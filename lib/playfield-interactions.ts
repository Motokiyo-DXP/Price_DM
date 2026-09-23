export type PlayZone =
  | "deck"
  | "deckInspection"
  | "hand"
  | "shield"
  | "mana"
  | "battle"
  | "graveyard"
  | "hyperspatial"
  | "gr"
  | "abyss"
  | "reveal";

export type CardFace = "face_up" | "face_down" | "owner_only";

export type ShieldPlacementMarker = {
  turn: number;
  order: number;
};

export type MoveDefaults = {
  face: CardFace;
  shieldMarker: ShieldPlacementMarker | null;
};

export type MoveRule = "prohibited" | "face_down" | "face_up" | "special";

const zones: PlayZone[] = ["battle", "shield", "deck", "deckInspection", "graveyard", "hyperspatial", "gr", "abyss", "mana", "reveal", "hand"];

export const MOVE_RULE_TABLE = Object.fromEntries(zones.map((from) => [
  from,
  Object.fromEntries(zones.map((to) => [to, from === to ? "prohibited" : to === "shield" ? "face_down" : to === "deck" ? "special" : "face_up"])),
])) as Record<PlayZone, Record<PlayZone, MoveRule>>;

export function getMoveRule(from: PlayZone, to: PlayZone): MoveRule {
  return MOVE_RULE_TABLE[from][to];
}

export function moveDefaults(
  from: PlayZone,
  to: PlayZone,
  context: { turn: number; shieldPlacementOrder: number },
): MoveDefaults {
  const rule = getMoveRule(from, to);
  if (rule === "prohibited") throw new Error(`Cards cannot move from ${from} to ${to}.`);
  // The selection UI for rule 2 (special) is intentionally deferred. Until it
  // is specified, completing the drop places the card face down in the deck.
  if (rule === "special") return { face: "face_down", shieldMarker: null };
  if (rule === "face_down") {
    return {
      face: "face_down",
      shieldMarker: {
        turn: context.turn,
        order: context.shieldPlacementOrder,
      },
    };
  }
  // A hand card is upright, but remains visible only to its owner.
  if (to === "hand") return { face: "owner_only", shieldMarker: null };
  return { face: "face_up", shieldMarker: null };
}

export type GestureKind = "drag" | "long_press" | "tap" | "none";

export function classifyPointerGesture(input: {
  durationMs: number;
  distancePx: number;
  cancelled?: boolean;
}): GestureKind {
  if (
    input.cancelled ||
    !Number.isFinite(input.durationMs) ||
    !Number.isFinite(input.distancePx) ||
    input.durationMs < 0 ||
    input.distancePx < 0
  ) return "none";
  if (input.distancePx > 8) return "drag";
  if (input.durationMs >= 500) return "long_press";
  if (input.durationMs <= 250) return "tap";
  return "none";
}

/**
 * A drag is latched as soon as the pointer crosses the drag threshold.
 * Layout changes (for example, expanding the hand fan) are allowed to move
 * the gesture origin afterwards, but must not turn an active drag back into
 * a tap or a long press when the pointer is released.
 */
export function resolvePointerReleaseGesture(input: {
  dragActivated: boolean;
  durationMs: number;
  distancePx: number;
  cancelled?: boolean;
}): GestureKind {
  if (input.cancelled) return "none";
  if (input.dragActivated) return "drag";
  return classifyPointerGesture(input);
}

export function resolveCenteredHandCardId(
  renderedCards: Iterable<{ centerX: number; id: string }>,
  viewportCenterX: number,
  touchedCardId: string,
) {
  let closest: { distance: number; id: string } | null = null;
  for (const renderedCard of renderedCards) {
    const distance = Math.abs(renderedCard.centerX - viewportCenterX);
    if (!Number.isFinite(distance)) continue;
    if (!closest || distance < closest.distance) closest = { distance, id: renderedCard.id };
  }
  return closest?.id ?? touchedCardId;
}

export function resolveDropTarget(
  candidates: Iterable<{ cardId?: string; owner: string; zone: PlayZone }>,
  owner: string,
  sourceZone: PlayZone,
  movingCardId: string,
  allowEmptySameZoneBattle = false,
) {
  const ordered = [...candidates];
  const target = ordered.find((candidate) => candidate.owner === owner && (
    candidate.zone !== sourceZone
    || (sourceZone === "battle"
      && candidate.zone === "battle"
      && ((Boolean(candidate.cardId) && candidate.cardId !== movingCardId)
        || (allowEmptySameZoneBattle && !candidate.cardId)))
  ));
  if (!target) return null;
  const targetZone = target.zone;
  const targetCardId = ordered.find((candidate) => candidate.owner === owner
    && candidate.zone === targetZone
    && candidate.cardId
    && candidate.cardId !== movingCardId)?.cardId ?? null;
  return { targetCardId, targetZone };
}

export function shouldUseZoneScroll(input: {
  dragActivated: boolean;
  horizontalWithinScrollAngle: boolean;
  isScrolling: boolean;
}) {
  return !input.dragActivated
    && (input.isScrolling || input.horizontalWithinScrollAngle);
}

export const ZONE_SCROLL_ANGLE_DEGREES = 20;

export function isWithinHorizontalScrollAngle(deltaX: number, deltaY: number) {
  return Math.abs(deltaX) > 8
    && Math.abs(deltaY) <= Math.abs(deltaX) * Math.tan(ZONE_SCROLL_ANGLE_DEGREES * Math.PI / 180);
}

export const STACK_HOLD_PROGRESS_MS = 300;
export const STACK_HOLD_MENU_MS = 500;

export function stackHoldPhase(elapsedMs: number) {
  if (elapsedMs >= STACK_HOLD_MENU_MS) return "menu" as const;
  if (elapsedMs >= STACK_HOLD_PROGRESS_MS) return "progress" as const;
  return "drag" as const;
}

export function resolveDeckDragRelease(
  placementChoice: "deck_top" | "deck_bottom" | null,
  finalZone: PlayZone | null,
) {
  if (placementChoice) return { kind: "deck" as const, choice: placementChoice };
  if (finalZone && finalZone !== "deck") return { kind: "zone" as const, zone: finalZone };
  return null;
}

export type DeckDropRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type DeckDropArea = "top" | "deck" | "bottom" | null;

/**
 * Resolve the one deck-related area under a pointer.  The upper and lower
 * hit targets deliberately use half-open intervals, while the actual deck
 * rect remains a cancellation area.  This keeps the three areas disjoint at
 * every boundary instead of relying on overlay stacking order.
 */
export function resolveDeckDropArea(input: {
  deckRect: DeckDropRect;
  pointX: number;
  pointY: number;
  horizontalPadding: number;
  verticalHitHeight: number;
}): DeckDropArea {
  const { deckRect, pointX, pointY, horizontalPadding, verticalHitHeight } = input;
  if (![deckRect.left, deckRect.right, deckRect.top, deckRect.bottom, pointX, pointY, horizontalPadding, verticalHitHeight].every(Number.isFinite)) return null;
  if (deckRect.right <= deckRect.left || deckRect.bottom <= deckRect.top || horizontalPadding < 0 || verticalHitHeight <= 0) return null;

  const insideHitColumn = pointX >= deckRect.left - horizontalPadding && pointX <= deckRect.right + horizontalPadding;
  if (!insideHitColumn) return null;

  if (pointX >= deckRect.left && pointX <= deckRect.right && pointY >= deckRect.top && pointY <= deckRect.bottom) return "deck";
  if (pointY >= deckRect.top - verticalHitHeight && pointY < deckRect.top) return "top";
  if (pointY > deckRect.bottom && pointY <= deckRect.bottom + verticalHitHeight) return "bottom";
  return null;
}

/**
 * A deck's broad top/bottom hit area is only an extension after the pointer
 * has crossed the deck button. Once active, keep it latched across that broad
 * area and a small button-relative exit margin.
 */
export function resolveDeckDropTargetActive(input: {
  wasActive: boolean;
  buttonRect: DeckDropRect;
  deckArea: DeckDropArea;
  pointX: number;
  pointY: number;
  exitDistancePx: number;
}): boolean {
  const { wasActive, buttonRect, deckArea, pointX, pointY, exitDistancePx } = input;
  if (![buttonRect.left, buttonRect.right, buttonRect.top, buttonRect.bottom, pointX, pointY, exitDistancePx].every(Number.isFinite)) return false;
  if (buttonRect.right <= buttonRect.left || buttonRect.bottom <= buttonRect.top || exitDistancePx < 0) return false;

  const withinButton = pointX >= buttonRect.left && pointX <= buttonRect.right
    && pointY >= buttonRect.top && pointY <= buttonRect.bottom;
  if (!wasActive) return withinButton;
  if (deckArea !== null) return true;

  const dx = pointX < buttonRect.left ? buttonRect.left - pointX : pointX > buttonRect.right ? pointX - buttonRect.right : 0;
  const dy = pointY < buttonRect.top ? buttonRect.top - pointY : pointY > buttonRect.bottom ? pointY - buttonRect.bottom : 0;
  return Math.hypot(dx, dy) <= exitDistancePx;
}

export type ManaCard = {
  id: string;
  civilizations: string[];
  tapped: boolean;
};

export type PlaySide = {
  label: string;
  cost: number;
  civilizations: string[];
  action: "summon" | "cast" | "play";
};

export type ManaPaymentResult = {
  valid: boolean;
  missingAmount: number;
  missingCivilizations: string[];
};

export function validateManaPayment(
  selectedMana: ManaCard[],
  side: PlaySide,
): ManaPaymentResult {
  const usableMana = selectedMana.filter((mana) => !mana.tapped);
  const availableCivilizations = new Set(
    usableMana.flatMap((mana) => mana.civilizations),
  );
  const requiredCivilizations = [...new Set(side.civilizations)];
  const missingCivilizations = requiredCivilizations.filter(
    (civilization) => !availableCivilizations.has(civilization),
  );
  const missingAmount = Math.max(0, side.cost - usableMana.length);
  return {
    valid: missingAmount === 0 && missingCivilizations.length === 0,
    missingAmount,
    missingCivilizations,
  };
}

export type DeckShortcut = {
  kind: "reveal_until_match";
  label: "ヨビニオン" | "メクレイド";
  maxCost: number;
  civilizations: string[];
  cardTypes: string[];
  destination: PlayZone;
  remainder: "bottom_random" | "bottom_chosen" | "shuffle";
};
