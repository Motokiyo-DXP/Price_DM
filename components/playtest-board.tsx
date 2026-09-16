"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  classifyPointerGesture,
  getMoveRule,
  isWithinHorizontalScrollAngle,
  resolveCenteredHandCardId,
  resolveDeckDragRelease,
  resolveDropTarget,
  resolvePointerReleaseGesture,
  shouldSwitchHandScrollToDrag,
  shouldUseZoneScroll,
  STACK_HOLD_MENU_MS,
  STACK_HOLD_PROGRESS_MS,
  type CardFace,
  type PlayZone,
  type ShieldPlacementMarker,
} from "@/lib/playfield-interactions";
import { CardArtwork } from "@/components/card-artwork";
import { CardVisualStage } from "@/components/card-visual-stage";
import {
  advanceTurn,
  bundleSelectedCards,
  clearCardMarkers,
  countZoneCards,
  detachCardFromStack,
  flipStackCards,
  findAttachedSpreadStackId,
  hasConnectedStack,
  initialBoard,
  initialOnlineBoard,
  moveCardsBetweenZones,
  toggleRevealPublic,
  resolveDraggedCardIds,
  resetBoard,
  runYobinion,
  setCardMarker,
  shuffleCards,
  shuffleSelectedCards,
  shuffleStackCards,
  stackOnHorizontalRoot,
  untapZoneCards,
  unbundleStack,
  type BoardState,
  type CardInstance,
  type DeckCard,
  type PlayerId,
} from "@/lib/playfield-board";
import { runDrawProductionShadow } from "@/lib/rule-engine/shadow/draw";
import { toggleCardTapWithProductionShadow } from "@/lib/rule-engine/shadow/tap";
import { isCardFaceVisible } from "@/lib/playfield-visibility";
import {
  calculateMarkingMenuPositions,
  calculateMarkingMenuCenter,
  calculateMarkingMenuBranchBounds,
  calculateMarkingMenuVisualBounds,
  calculateStackDestinationPositions,
  calculateStackDestinationVisualBounds,
  DEFAULT_MARKING_MENU_ITEMS,
  isMarkingMenuGestureCancelled,
  OTHER_BRANCH_HOLD_MS,
  selectMarkingMenuItem,
  selectStackDestinationItem,
  type MarkingMenuAction,
  type StackDestinationAction,
} from "@/lib/marking-menu";
import { LONG_PRESS_MAX_MS, LONG_PRESS_MIN_MS, readLongPressMs, saveLongPressMs } from "@/lib/play-input-settings";
import { getContextualActions, getOtherContextualActions } from "@/lib/play-context-actions";
import type { CardMarker } from "@/lib/playfield-board";
import { isCircleGesture, type GesturePoint } from "@/lib/circle-gesture";
import { resolvePlaytestInitialState } from "@/lib/playtest-initial-state";

export { initialBoard, initialOnlineBoard } from "@/lib/playfield-board";
export type { BoardState, CardInstance, DeckCard, PlayerId } from "@/lib/playfield-board";
export type ServerShuffleRequest = { owner: PlayerId; zone: PlayZone; mode: "deck" | "selection" | "stack"; cardIds?: string[]; stackId?: string };
export type ServerYobinionRequest = { owner: PlayerId; sourceId: string; dragonOnly: boolean };
export type ServerInspectionRequest = { owner: PlayerId; cardId: string };
export type ServerEffectWarningRequest = { owner: PlayerId; cardId: string };

const playerIds: PlayerId[] = ["p1", "p2"];
const visibleMarkerGroups = [
  [["meta_warning", "メタ注意"], ["removal_resistance", "除去耐性"], ["just_diver", "ジャストダイバー"], ["cannot_be_chosen", "選ばれない"], ["cannot_be_attacked", "アタックされない"], ["cannot_be_blocked", "ブロックされない"], ["hyper_mode", "ハイパーモード"], ["speed_attacker", "スピードアタッカー"], ["mach_fighter", "マッハファイター"], ["blocker", "ブロッカー"], ["slayer", "スレイヤー"], ["power_up", "パワーアップ"]],
  [["cannot_attack", "アタックできない"], ["cannot_block", "ブロックできない"], ["keep_tapped", "アンタップしない"], ["summoning_sickness", "召喚酔い"], ["ignore_ability", "能力無効"], ["power_down", "パワーダウン"]],
] as const satisfies ReadonlyArray<ReadonlyArray<readonly [CardMarker, string]>>;
const markerLabels: Partial<Record<CardMarker, string>> = Object.fromEntries(visibleMarkerGroups.flat().map(([marker, label]) => [marker, label]));
const markerAssetNames: Partial<Record<CardMarker, string>> = { ...Object.fromEntries(visibleMarkerGroups.flat().map(([marker, label]) => [marker, label])), cannot_attack: "アタック禁止", cannot_block: "ブロック禁止", speed_attacker: "スピアタ" };
const visibleZones: PlayZone[] = ["battle", "mana", "shield", "graveyard", "hand"];
const moveDestinationZones: PlayZone[] = ["battle", "shield", "deck", "graveyard", "hyperspatial", "gr", "abyss", "mana", "reveal", "hand"];
const auxiliaryZones: PlayZone[] = ["reveal", "graveyard"];
const externalZones: PlayZone[] = ["hyperspatial", "gr", "abyss"];
const nonStackableZones: PlayZone[] = ["mana", "graveyard", "hyperspatial", "gr", "abyss"];
const delayedStackPreviewZones: PlayZone[] = ["battle", "shield", "reveal", "hand"];
const cardSwipeScrollableZones: PlayZone[] = ["battle", "mana", "shield", "hand", "reveal", "graveyard", "hyperspatial", "gr", "abyss"];
const zoneInertiaFrames = new WeakMap<HTMLElement, number>();
const shuffleFeedbackTimers = new WeakMap<HTMLElement, number>();
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function animateShuffleFeedback(resolveTargets: () => Iterable<HTMLElement>) {
  window.requestAnimationFrame(() => {
    const targets = [...new Set(resolveTargets())];
    targets.forEach((target) => {
      const previousTimer = shuffleFeedbackTimers.get(target);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      target.classList.remove("shuffle-feedback");
      void target.offsetWidth;
      target.classList.add("shuffle-feedback");
      const timer = window.setTimeout(() => {
        target.classList.remove("shuffle-feedback");
        shuffleFeedbackTimers.delete(target);
      }, 820);
      shuffleFeedbackTimers.set(target, timer);
    });
  });
}

function cardShuffleFeedbackTargets(cardIds: Iterable<string>) {
  return [...cardIds].flatMap((cardId) => {
    const elements = document.querySelectorAll<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`);
    return [...elements].map((element) => element.closest<HTMLElement>(".card-stack") ?? element);
  });
}

function readCenteredHandCardId(container: HTMLElement | null, touchedCardId: string) {
  if (!container) return touchedCardId;
  const focusedCardId = container.dataset.focusedCardId;
  if (focusedCardId && container.querySelector(`[data-card-id="${CSS.escape(focusedCardId)}"]`)) {
    return focusedCardId;
  }
  const renderedCards = [...container.querySelectorAll<HTMLElement>(":scope > .play-card, :scope > .card-stack, :scope > .connected-stacks")].flatMap((element) => {
    const cardElement = element.matches(".play-card")
      ? element
      : [...element.querySelectorAll<HTMLElement>(".play-card")].at(-1);
    if (!cardElement?.dataset.cardId) return [];
    const bounds = element.getBoundingClientRect();
    return [{ centerX: bounds.left + bounds.width / 2, id: cardElement.dataset.cardId }];
  });
  return resolveCenteredHandCardId(renderedCards, document.documentElement.clientWidth / 2, touchedCardId);
}

function readDropHit(elements: Element[], owner: PlayerId, sourceZone: PlayZone, movingCardId: string, allowEmptySameZoneBattle = false) {
  const candidates = elements.flatMap((element) => {
    const targetZoneElement = element.closest<HTMLElement>("[data-drop-zone]");
    const candidateOwner = targetZoneElement?.dataset.dropOwner;
    const candidateZone = targetZoneElement?.dataset.dropZone as PlayZone | undefined;
    if (!candidateOwner || !candidateZone) return [];
    const cardId = element.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
    return [{ cardId, owner: candidateOwner, zone: candidateZone }];
  });
  const resolved = resolveDropTarget(candidates, owner, sourceZone, movingCardId, allowEmptySameZoneBattle);
  if (!resolved) return { targetCard: null, targetZone: undefined, targetZoneElement: null };
  const targetZoneElement = elements
    .map((element) => element.closest<HTMLElement>("[data-drop-zone]"))
    .find((element) => element?.dataset.dropOwner === owner && element.dataset.dropZone === resolved.targetZone) ?? null;
  const targetCard = targetZoneElement && resolved.targetCardId
    ? elements
      .map((element) => element.closest<HTMLElement>("[data-card-id]"))
      .find((element) => element?.dataset.cardId === resolved.targetCardId
        && element.closest<HTMLElement>("[data-drop-zone]") === targetZoneElement) ?? null
    : null;
  return { targetCard, targetZone: resolved.targetZone, targetZoneElement };
}

function clearDropGuide() {
  document.querySelectorAll<HTMLElement>(".drop-guide-active").forEach((element) => element.classList.remove("drop-guide-active"));
}

function showDropGuide(owner: PlayerId, zone: PlayZone | undefined, elements: Element[] = []) {
  clearDropGuide();
  if (!zone) return;
  document.querySelectorAll<HTMLElement>(`[data-drop-owner="${owner}"][data-drop-zone="${zone}"]`).forEach((element) => {
    if (!element.matches(".special-preview")) element.classList.add("drop-guide-active");
  });
  elements
    .map((element) => element.closest<HTMLElement>("[data-deck-placement]"))
    .find((element) => element?.dataset.deckPlacement)
    ?.classList.add("drop-guide-active");
}
const zoneLabels: Record<PlayZone, string> = {
  deck: "山札", hand: "手札", shield: "シールド", mana: "マナ",
  battle: "バトルゾーン", graveyard: "墓地", hyperspatial: "超次元",
  gr: "GR", abyss: "深淵", reveal: "仮置き場",
};

type DragPreviewState = { imageUrl: string | null; x: number; y: number } | null;
type StackDestinationGesture = { pointerX: number; pointerY: number; x: number; y: number };

function CardDragPreview({ preview }: { preview: DragPreviewState }) {
  if (!preview || typeof document === "undefined") return null;
  return createPortal(
    <span aria-hidden="true" className="card-drag-preview" style={{ left: preview.x, top: preview.y }}>
      <CardVisualStage>
        <CardArtwork imageUrl={preview.imageUrl} name="" sizes="90px" />
      </CardVisualStage>
    </span>,
    document.body,
  );
}

function LongPressProgress({ durationMs, label, point }: { durationMs: number; label: string; point: { x: number; y: number } | null }) {
  if (!point || typeof document === "undefined") return null;
  return createPortal(
    <span aria-label={label} className="long-press-progress" style={{ "--long-press-ms": `${durationMs}ms`, left: point.x, top: point.y } as CSSProperties}>
      <svg aria-hidden="true" viewBox="0 0 36 36">
        <circle className="track" cx="18" cy="18" r="15" />
        <circle className="value" cx="18" cy="18" r="15" />
      </svg>
    </span>,
    document.body,
  );
}

function StackHoldProgress({ point }: { point: { x: number; y: number } | null }) {
  return <LongPressProgress durationMs={STACK_HOLD_MENU_MS - STACK_HOLD_PROGRESS_MS} label="重ね方パネルを開くまでの残り時間" point={point} />;
}

function DeckPlacementPreview({ owner, preview }: { owner: PlayerId; preview: { centerX: number; centerY: number } | null }) {
  if (!preview || typeof document === "undefined") return null;
  return createPortal(
    <span className="special-preview deck" data-drop-owner={owner} data-drop-zone="deck" style={{ left: preview.centerX, top: preview.centerY }}>
      <i className="choice top" data-deck-placement="deck_top">山札の上</i>
      <i className="choice bottom" data-deck-placement="deck_bottom">山札の下</i>
    </span>,
    document.body,
  );
}

type CardViewProps = {
  card: CardInstance;
  owner: PlayerId;
  view: PlayerId;
  zone: PlayZone;
  onMove: (owner: PlayerId, from: PlayZone, cardId: string, to: PlayZone, targetCardId?: string, choice?: "deck_top" | "deck_bottom" | "face_up_top" | "face_down_top" | "face_up_bottom" | "face_down_bottom" | "face_up_spread", individual?: boolean) => void;
  onTap: (owner: PlayerId, zone: PlayZone, cardId: string) => void;
  onDoubleTap: (owner: PlayerId, zone: PlayZone, card: CardInstance) => void;
  onDetails: (card: CardInstance) => void;
  onMarkingMenuStart: (owner: PlayerId, zone: PlayZone, card: CardInstance, x: number, y: number, deckCard?: boolean) => void;
  onMarkingMenuMove: (x: number, y: number) => void;
  onMarkingMenuEnd: (x: number, y: number) => void;
  onOptions: (owner: PlayerId, zone: PlayZone, card: CardInstance) => void;
  onCollapsedHandHold?: () => void;
  selected: boolean;
  inspected?: boolean;
  inspectionViewer?: PlayerId;
  revealHiddenCards?: boolean;
  privateReveal?: boolean;
  revealPublic?: boolean;
  individualFromStack?: boolean;
  revealDeckToOwner?: boolean;
};

function CardView({ card, owner, view, zone, onMove, onTap, onDoubleTap, onDetails, onMarkingMenuStart, onMarkingMenuMove, onMarkingMenuEnd, onOptions, onCollapsedHandHold, selected, inspected = false, inspectionViewer, revealHiddenCards = false, privateReveal = false, revealPublic = false, individualFromStack = false, revealDeckToOwner = false }: CardViewProps) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const currentPoint = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const markingMenuOpen = useRef(false);
  const markingMenuEnd = useRef(onMarkingMenuEnd);
  markingMenuEnd.current = onMarkingMenuEnd;
  const suppressClick = useRef(false);
  const tapTimer = useRef<number | null>(null);
  const stackPreviewTimer = useRef<number | null>(null);
  const stackProgressTimer = useRef<number | null>(null);
  const stackPreviewZone = useRef<PlayZone | null>(null);
  const stackPreviewCandidate = useRef<{ centerX: number; centerY: number; holdX: number; holdY: number; targetCardId: string; targetZone: PlayZone } | null>(null);
  const zoneScrollGesture = useRef(false);
  const zoneScrollContainer = useRef<HTMLElement | null>(null);
  const zoneScrollStartLeft = useRef(0);
  const zoneScrollLastPoint = useRef<{ at: number; x: number; y: number } | null>(null);
  const zoneScrollVelocity = useRef(0);
  const interactionCardId = useRef(card.instanceId);
  const dragActivated = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const pointerTarget = useRef<HTMLButtonElement | null>(null);
  const pointerListenerCleanup = useRef<(() => void) | null>(null);
  const collapsedHandGesture = useRef(false);
  const collapsedHandHoldReady = useRef(false);
  const lastTapAt = useRef(0);
  const visible = zone === "reveal" && privateReveal
    ? owner === view || revealPublic
    : isCardFaceVisible({ face: card.face, inspected, inspectionViewer, owner, revealHiddenCards, deckDrawer: revealDeckToOwner, view, zone });
  const [specialPreview, setSpecialPreview] = useState<{ centerX: number; centerY: number; kind: "deck" | "stack"; targetCardId?: string; targetZone: PlayZone } | null>(null);
  const specialPreviewRef = useRef<typeof specialPreview>(null);
  const [stackHoldProgress, setStackHoldProgress] = useState<{ x: number; y: number } | null>(null);
  const [holdActive, setHoldActive] = useState(false);
  const [holdPoint, setHoldPoint] = useState({ x: 0, y: 0 });
  const [dragPreview, setDragPreview] = useState<DragPreviewState>(null);

  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    if (stackPreviewTimer.current !== null) window.clearTimeout(stackPreviewTimer.current);
    if (stackProgressTimer.current !== null) window.clearTimeout(stackProgressTimer.current);
    pointerListenerCleanup.current?.();
  }, []);

  function detachPointerListeners() {
    pointerListenerCleanup.current?.();
    pointerListenerCleanup.current = null;
    activePointerId.current = null;
    pointerTarget.current = null;
  }

  function attachPointerListeners(pointerId: number) {
    pointerListenerCleanup.current?.();
    const move = (event: PointerEvent) => {
      if (event.pointerId === activePointerId.current) pointerMove(event);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === activePointerId.current) pointerUp(event);
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === activePointerId.current) pointerCancel(event);
    };
    activePointerId.current = pointerId;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    pointerListenerCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }

  function clearStackPreviewTimer() {
    if (stackPreviewTimer.current !== null) window.clearTimeout(stackPreviewTimer.current);
    if (stackProgressTimer.current !== null) window.clearTimeout(stackProgressTimer.current);
    stackPreviewTimer.current = null;
    stackProgressTimer.current = null;
    stackPreviewZone.current = null;
    stackPreviewCandidate.current = null;
    setStackHoldProgress(null);
  }

  function updateSpecialPreview(next: typeof specialPreview) {
    specialPreviewRef.current = next;
    setSpecialPreview(next);
  }

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    clearDropGuide();
    pointerTarget.current = event.currentTarget;
    attachPointerListeners(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY, at: performance.now() };
    currentPoint.current = { x: event.clientX, y: event.clientY };
    markingMenuOpen.current = false;
    dragActivated.current = false;
    suppressClick.current = false;
    zoneScrollGesture.current = false;
    zoneScrollContainer.current = event.currentTarget.closest<HTMLElement>(".play-zone-cards");
    collapsedHandGesture.current = zone === "hand" && Boolean(event.currentTarget.closest(".fan-collapsed"));
    collapsedHandHoldReady.current = false;
    interactionCardId.current = zone === "hand"
      ? readCenteredHandCardId(zoneScrollContainer.current, card.instanceId)
      : card.instanceId;
    zoneScrollStartLeft.current = zoneScrollContainer.current?.scrollLeft ?? 0;
    zoneScrollLastPoint.current = { at: performance.now(), x: event.clientX, y: event.clientY };
    zoneScrollVelocity.current = 0;
    setHoldActive(true);
    setHoldPoint({ x: event.clientX, y: event.clientY });
    setDragPreview(null);
    updateSpecialPreview(null);
    clearStackPreviewTimer();
    const inertiaFrame = zoneScrollContainer.current ? zoneInertiaFrames.get(zoneScrollContainer.current) : undefined;
    if (inertiaFrame !== undefined && zoneScrollContainer.current) {
      window.cancelAnimationFrame(inertiaFrame);
      zoneInertiaFrames.delete(zoneScrollContainer.current);
    }
    longPressTimer.current = window.setTimeout(() => {
      if (!start.current || !currentPoint.current) return;
      setHoldActive(false);
      if (collapsedHandGesture.current) {
        collapsedHandHoldReady.current = true;
        onCollapsedHandHold?.();
        // 展開による中央寄せが完了した位置を、このまま続くスワイプの起点にする。
        window.requestAnimationFrame(() => {
          if (!start.current || !currentPoint.current) return;
          start.current = { ...start.current, x: currentPoint.current.x, y: currentPoint.current.y };
          zoneScrollStartLeft.current = zoneScrollContainer.current?.scrollLeft ?? 0;
          zoneScrollLastPoint.current = { at: performance.now(), x: currentPoint.current.x, y: currentPoint.current.y };
        });
        return;
      }
      markingMenuOpen.current = true;
      suppressClick.current = true;
      onMarkingMenuStart(owner, zone, card, start.current.x, start.current.y);
    }, readLongPressMs());
  }

  function pointerMove(event: PointerEvent) {
    if (!start.current) return;
    currentPoint.current = { x: event.clientX, y: event.clientY };
    // Once the Maya menu is open, every movement belongs to that gesture.
    // Run this before the horizontal zone-scroll classifier, otherwise crossing
    // the touch origin's horizontal axis incorrectly converts the hold to scroll.
    if (markingMenuOpen.current) {
      clearDropGuide();
      dragActivated.current = false;
      onMarkingMenuMove(event.clientX, event.clientY);
      return;
    }
    const deltaX = event.clientX - start.current.x;
    const deltaY = event.clientY - start.current.y;
    if (collapsedHandGesture.current && !collapsedHandHoldReady.current) return;
    const lastScrollPoint = zoneScrollLastPoint.current;
    const stepX = lastScrollPoint ? event.clientX - lastScrollPoint.x : deltaX;
    const stepY = lastScrollPoint ? event.clientY - lastScrollPoint.y : deltaY;
    const horizontalWithinScrollAngle = isWithinHorizontalScrollAngle(deltaX, deltaY);
    const switchHandScrollToDrag = shouldSwitchHandScrollToDrag({
      isScrolling: zoneScrollGesture.current,
      stepX,
      stepY,
      zone,
    });
    if (switchHandScrollToDrag) {
      zoneScrollGesture.current = false;
      interactionCardId.current = readCenteredHandCardId(zoneScrollContainer.current, interactionCardId.current);
      start.current = { ...start.current, x: event.clientX, y: event.clientY - Math.sign(stepY || 1) * 12 };
    } else if (cardSwipeScrollableZones.includes(zone) && shouldUseZoneScroll({
      dragActivated: dragActivated.current,
      horizontalWithinScrollAngle,
      isScrolling: zoneScrollGesture.current,
    })) {
      zoneScrollGesture.current = true;
      dragActivated.current = false;
      setHoldActive(false);
      setDragPreview(null);
      clearStackPreviewTimer();
      updateSpecialPreview(null);
      clearDropGuide();
      if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      if (zoneScrollContainer.current) {
        zoneScrollContainer.current.scrollLeft = zoneScrollStartLeft.current - deltaX;
        const now = performance.now();
        const previous = zoneScrollLastPoint.current;
        if (previous && now > previous.at) zoneScrollVelocity.current = -(event.clientX - previous.x) / (now - previous.at);
        zoneScrollLastPoint.current = { at: now, x: event.clientX, y: event.clientY };
      }
      return;
    }
    if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) {
      dragActivated.current = true;
      setHoldActive(false);
      const sourceElement = [...(zoneScrollContainer.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])]
        .find((element) => element.dataset.cardId === interactionCardId.current);
      const previewImage = sourceElement?.querySelector<HTMLImageElement>(".card-artwork img")?.getAttribute("src")
        ?? (visible ? card.imageUrl : "/card-back.svg");
      setDragPreview({ x: event.clientX, y: event.clientY, imageUrl: previewImage });
    }
    if (specialPreviewRef.current?.kind === "stack") {
      showDropGuide(owner, specialPreviewRef.current.targetZone);
      return;
    }
    if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) {
      const elements = document.elementsFromPoint(event.clientX, event.clientY);
      const movingCardId = interactionCardId.current;
      const { targetCard, targetZone, targetZoneElement } = readDropHit(elements, owner, zone, movingCardId, individualFromStack);
      showDropGuide(owner, targetZone, elements);
      const deckTarget = targetZone === "deck" ? targetZoneElement : null;
      const targetBounds = targetCard?.dataset.cardId ? targetCard.getBoundingClientRect() : null;
      const candidate = targetCard?.dataset.cardId && targetBounds && targetZone
        ? { centerX: targetBounds.left + targetBounds.width / 2, centerY: targetBounds.top + targetBounds.height / 2, holdX: event.clientX, holdY: event.clientY, targetCardId: targetCard.dataset.cardId, targetZone }
        : null;
      if (targetZone && nonStackableZones.includes(targetZone)) {
        clearStackPreviewTimer();
        updateSpecialPreview(null);
      } else if (targetZone && delayedStackPreviewZones.includes(targetZone)) {
        const previousCandidate = stackPreviewCandidate.current;
        const sameCandidate = Boolean(candidate
          && previousCandidate
          && previousCandidate.targetCardId === candidate.targetCardId
          && previousCandidate.targetZone === candidate.targetZone);
        if (!candidate) {
          clearStackPreviewTimer();
          updateSpecialPreview(null);
        } else if (!sameCandidate) {
          clearStackPreviewTimer();
          updateSpecialPreview(null);
          stackPreviewZone.current = targetZone;
          stackPreviewCandidate.current = candidate;
          stackProgressTimer.current = window.setTimeout(() => {
            const currentCandidate = stackPreviewCandidate.current;
            if (currentCandidate) setStackHoldProgress({ x: currentCandidate.holdX, y: currentCandidate.holdY });
            stackProgressTimer.current = null;
          }, STACK_HOLD_PROGRESS_MS);
          stackPreviewTimer.current = window.setTimeout(() => {
            const currentCandidate = stackPreviewCandidate.current;
            setStackHoldProgress(null);
            if (currentCandidate) updateSpecialPreview({ ...currentCandidate, kind: "stack" });
            stackPreviewTimer.current = null;
          }, STACK_HOLD_MENU_MS);
        }
      } else if (targetCard?.dataset.cardId && candidate) {
        clearStackPreviewTimer();
        updateSpecialPreview({ ...candidate, kind: "stack" });
      } else if (deckTarget && zone !== "deck") {
        clearStackPreviewTimer();
        const bounds = deckTarget.getBoundingClientRect();
        updateSpecialPreview({ centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2, kind: "deck", targetZone: "deck" });
      } else {
        clearStackPreviewTimer();
        updateSpecialPreview(null);
      }
    }
    if (!collapsedHandGesture.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 12 && longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function pointerUp(event: PointerEvent) {
    const target = pointerTarget.current;
    detachPointerListeners();
    if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (!start.current) return;
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    setHoldActive(false);
    setDragPreview(null);
    clearStackPreviewTimer();
    clearDropGuide();
    if (collapsedHandGesture.current && !collapsedHandHoldReady.current) {
      dragActivated.current = false;
      collapsedHandGesture.current = false;
      start.current = null;
      currentPoint.current = null;
      return;
    }
    if (zoneScrollGesture.current) {
      dragActivated.current = false;
      const inertiaContainer = zoneScrollContainer.current;
      if (inertiaContainer && Math.abs(zoneScrollVelocity.current) >= 0.02) {
        let velocity = Math.max(-2.4, Math.min(2.4, zoneScrollVelocity.current));
        let previousAt = performance.now();
        const coast = (now: number) => {
          const elapsed = Math.min(40, now - previousAt);
          previousAt = now;
          const before = inertiaContainer.scrollLeft;
          inertiaContainer.scrollLeft += velocity * elapsed;
          velocity *= Math.pow(0.94, elapsed / 16.67);
          if (Math.abs(velocity) < 0.02 || inertiaContainer.scrollLeft === before) {
            zoneInertiaFrames.delete(inertiaContainer);
            return;
          }
          const nextFrame = window.requestAnimationFrame(coast);
          zoneInertiaFrames.set(inertiaContainer, nextFrame);
        };
        const firstFrame = window.requestAnimationFrame(coast);
        zoneInertiaFrames.set(inertiaContainer, firstFrame);
      }
      zoneScrollGesture.current = false;
      zoneScrollContainer.current = null;
      zoneScrollLastPoint.current = null;
      collapsedHandGesture.current = false;
      collapsedHandHoldReady.current = false;
      start.current = null;
      currentPoint.current = null;
      updateSpecialPreview(null);
      return;
    }
    if (markingMenuOpen.current) {
      dragActivated.current = false;
      markingMenuOpen.current = false;
      start.current = null;
      currentPoint.current = null;
      markingMenuEnd.current(event.clientX, event.clientY);
      return;
    }
    const distance = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
    const gesture = resolvePointerReleaseGesture({
      dragActivated: dragActivated.current,
      durationMs: performance.now() - start.current.at,
      distancePx: distance,
    });
    dragActivated.current = false;
    start.current = null;
    collapsedHandGesture.current = false;
    collapsedHandHoldReady.current = false;
    if (gesture === "drag") {
      const movingCardId = interactionCardId.current;
      const activeSpecialPreview = specialPreviewRef.current;
      if (activeSpecialPreview) {
        if (activeSpecialPreview.kind === "deck") {
          const elements = document.elementsFromPoint(event.clientX, event.clientY);
          const placementElement = elements
            .map((element) => element.closest<HTMLElement>("[data-deck-placement]"))
            .find((element) => element?.dataset.deckPlacement);
          const placement = placementElement?.dataset.deckPlacement === "deck_top" || placementElement?.dataset.deckPlacement === "deck_bottom"
            ? placementElement.dataset.deckPlacement
            : null;
          const { targetZone } = readDropHit(elements, owner, zone, movingCardId, individualFromStack);
          const release = resolveDeckDragRelease(placement, targetZone ?? null);
          if (release?.kind === "deck") onMove(owner, zone, movingCardId, "deck", undefined, release.choice);
          else if (release?.kind === "zone") onMove(owner, zone, movingCardId, release.zone);
          updateSpecialPreview(null);
          return;
        }
        const dx = event.clientX - activeSpecialPreview.centerX;
        const dy = event.clientY - activeSpecialPreview.centerY;
        const optionDistance = Math.hypot(dx, dy);
        const outerCancelDistance = 2.5 * (48 + 3 * (100 - 48));
        if (optionDistance >= 48 && optionDistance <= outerCancelDistance) {
          if (Math.abs(dx) > Math.abs(dy) * 2 && dx > 0) onMove(owner, zone, movingCardId, activeSpecialPreview.targetZone, activeSpecialPreview.targetCardId, "face_up_spread");
          else onMove(owner, zone, movingCardId, activeSpecialPreview.targetZone, activeSpecialPreview.targetCardId, `${dx < 0 ? "face_down" : "face_up"}_${dy < 0 ? "top" : "bottom"}` as "face_up_top" | "face_down_top" | "face_up_bottom" | "face_down_bottom");
          updateSpecialPreview(null);
          return;
        }
        updateSpecialPreview(null);
        return;
      }
      const elements = document.elementsFromPoint(event.clientX, event.clientY);
      const { targetCard, targetZone } = readDropHit(elements, owner, zone, movingCardId, individualFromStack);
      if (targetCard?.dataset.cardId) {
        if (targetZone && (nonStackableZones.includes(targetZone) || delayedStackPreviewZones.includes(targetZone))) {
          onMove(owner, zone, movingCardId, targetZone);
        } else if (targetZone) {
          onMove(owner, zone, movingCardId, targetZone, targetCard.dataset.cardId);
        }
      } else if (targetZone) onMove(owner, zone, movingCardId, targetZone);
      updateSpecialPreview(null);
      return;
    }
    if (gesture === "long_press") return;
    if (gesture === "tap") {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      const now = performance.now();
      if (now - lastTapAt.current <= 260) {
        lastTapAt.current = 0;
        onDoubleTap(owner, zone, card);
        return;
      }
      lastTapAt.current = now;
      tapTimer.current = window.setTimeout(() => onTap(owner, zone, card.instanceId), 260);
    }
  }

  function pointerCancel(event: PointerEvent) {
    const target = pointerTarget.current;
    detachPointerListeners();
    if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (markingMenuOpen.current && start.current) markingMenuEnd.current(start.current.x, start.current.y);
    start.current = null;
    currentPoint.current = null;
    markingMenuOpen.current = false;
    zoneScrollGesture.current = false;
    zoneScrollContainer.current = null;
    collapsedHandGesture.current = false;
    collapsedHandHoldReady.current = false;
    dragActivated.current = false;
    updateSpecialPreview(null);
    clearDropGuide();
    setHoldActive(false);
    setDragPreview(null);
    clearStackPreviewTimer();
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  function doubleClick() {
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    lastTapAt.current = 0;
    onDoubleTap(owner, zone, card);
  }

  return (
    <>
      <button
      aria-label={`${visible ? card.name : "裏向きカード"}${card.tapped ? "、タップ中" : ""}`}
      className={`play-card ${visible ? "face-up" : "face-down"} ${card.tapped ? "tapped" : ""} ${selected ? "selected" : ""}`}
      data-card-id={card.instanceId}
      data-stack-id={card.stackId ?? undefined}
      onDoubleClick={doubleClick}
      onClick={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={pointerDown}
      type="button"
    >
      {visible ? <CardArtwork imageUrl={card.imageUrl} name={card.name} sizes="70px" /> : <CardArtwork imageUrl="/card-back.svg" name="裏向きカード" sizes="70px" />}
      {inspected && inspectionViewer !== view ? <span aria-label="確認中" className="card-inspection-eye">👁</span> : null}
      {card.shieldMarker ? <small>追加{card.shieldMarker.order}</small> : null}
      {card.markers?.length ? <span className="card-marker-list">{Array.from(new Set(card.markers)).map((marker) => {
        const label = markerLabels[marker] ?? (marker === "shield_force" ? "シールドフォース" : "召喚酔い");
        const count = card.markers?.filter((item) => item === marker).length ?? 0;
        return <i key={marker} title={marker === "slayer" ? `${label} ×${count}` : label}>{markerAssetNames[marker] ? <img alt="" src={`/markers/preview/${markerAssetNames[marker]}.svg`} /> : marker === "shield_force" ? <img alt="" src="/markers/shield-force.svg" /> : "酔"}{marker === "slayer" && count > 1 ? <b>{count}</b> : null}</i>;
      })}</span> : null}
      </button>
      <LongPressProgress durationMs={readLongPressMs()} label="長押し操作が有効になるまでの残り時間" point={holdActive ? holdPoint : null} />
      <CardDragPreview preview={dragPreview} />
      <DeckPlacementPreview owner={owner} preview={specialPreview?.kind === "deck" ? specialPreview : null} />
      <StackHoldProgress point={stackHoldProgress} />
      {specialPreview?.kind === "stack" ? <StackDestinationMarkingMenu menu={{ pointerX: dragPreview?.x ?? specialPreview.centerX, pointerY: dragPreview?.y ?? specialPreview.centerY, x: specialPreview.centerX, y: specialPreview.centerY }} /> : null}
    </>
  );
}

type ZoneProps = CardViewProps extends infer _T ? {
  owner: PlayerId; view: PlayerId; zone: PlayZone; cards: CardInstance[];
  onMove: CardViewProps["onMove"]; onTap: CardViewProps["onTap"]; onDoubleTap: CardViewProps["onDoubleTap"];
  onDetails: CardViewProps["onDetails"]; onOptions: CardViewProps["onOptions"];
  onMarkingMenuStart: CardViewProps["onMarkingMenuStart"];
  onMarkingMenuMove: CardViewProps["onMarkingMenuMove"];
  onMarkingMenuEnd: CardViewProps["onMarkingMenuEnd"];
  selectedCards: Set<string>;
  onCircle: (owner: PlayerId, zone: PlayZone) => void;
  onEmptyDoubleTap: (owner: PlayerId, zone: PlayZone) => void;
  onZoneSelect?: (owner: PlayerId, zone: PlayZone, targetCard?: CardInstance) => boolean;
  onBackgroundTap?: () => void;
  openedStack?: { owner: PlayerId; zone: PlayZone; stackId: string } | null;
  inspection?: BoardState["inspection"];
  onCloseStack?: () => void;
  onUnbundleStack?: (owner: PlayerId, zone: PlayZone, stackId: string) => void;
  deckName?: string;
  fan?: boolean;
  revealHiddenCards?: boolean;
  privateReveal?: boolean;
  revealPublic?: boolean;
  revealDeckToOwner?: boolean;
  onToggleReveal?: (owner: PlayerId) => void;
} : never;

function Zone({ owner, view, zone, cards, onMove, onTap, onDoubleTap, onDetails, onMarkingMenuStart, onMarkingMenuMove, onMarkingMenuEnd, onOptions, selectedCards, onCircle, onEmptyDoubleTap, onZoneSelect, onBackgroundTap, openedStack, onCloseStack, onUnbundleStack, inspection, deckName, fan = false, revealHiddenCards = false, privateReveal = false, revealPublic = false, revealDeckToOwner = false, onToggleReveal }: ZoneProps) {
  const onCardMarkingMenuStart: CardViewProps["onMarkingMenuStart"] = (cardOwner, cardZone, card, x, y) => onMarkingMenuStart(cardOwner, cardZone, card, x, y, revealDeckToOwner);
  const circlePoints = useRef<GesturePoint[]>([]);
  const lastEmptyTapAt = useRef(0);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const zoneRef = useRef<HTMLElement | null>(null);
  useIsomorphicLayoutEffect(() => {
    const container = cardsRef.current;
    if (!container || !fan) return;
    const fanContainer = container;
    let frame = 0;
    function applyFanLayout() {
      const bounds = fanContainer.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const radius = Math.max(viewportWidth * 1.35, 360);
      const viewportCenterX = viewportWidth / 2;
      const elements = [...fanContainer.querySelectorAll<HTMLElement>(":scope > .play-card, :scope > .card-stack, :scope > .connected-stacks")];
      const linearPositions = elements.map((element) => bounds.left + element.offsetLeft - fanContainer.scrollLeft + element.offsetWidth / 2 - viewportCenterX);
      const activeIndex = linearPositions.length
        ? linearPositions.reduce((closest, position, index) => Math.abs(position) < Math.abs(linearPositions[closest]) ? index : closest, 0)
        : -1;
      const focusedIndex = activeIndex;
      const focusedElement = activeIndex >= 0 ? elements[activeIndex] : null;
      const focusedCard = focusedElement?.matches(".play-card")
        ? focusedElement
        : [...(focusedElement?.querySelectorAll<HTMLElement>(".play-card") ?? [])].at(-1);
      if (focusedCard?.dataset.cardId) fanContainer.dataset.focusedCardId = focusedCard.dataset.cardId;
      else delete fanContainer.dataset.focusedCardId;
      elements.forEach((element, index) => {
        const linearX = linearPositions[index];
        const theta = index === focusedIndex
          ? 0
          : Math.max(-0.62, Math.min(0.62, linearX / radius));
        const circularX = Math.sin(theta) * radius;
        const y = radius * (1 - Math.cos(theta));
        const angle = theta * 180 / Math.PI;
        element.style.setProperty("--fan-x", `${circularX - linearX}px`);
        element.style.setProperty("--fan-y", `${y}px`);
        element.style.setProperty("--fan-angle", `${angle}deg`);
        element.style.setProperty("--fan-scale", index === focusedIndex ? "2.8" : "2");
        element.dataset.fanFocused = index === focusedIndex ? "true" : "false";
        element.style.zIndex = `${1000 - Math.round(Math.abs(linearX))}`;
      });
    }
    function updateFan() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyFanLayout);
    }
    if (!container.dataset.fanInitialized) {
      container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
      container.dataset.fanInitialized = "true";
    }
    applyFanLayout();
    container.addEventListener("scroll", updateFan, { passive: true });
    window.addEventListener("resize", updateFan);
    return () => { window.cancelAnimationFrame(frame); container.removeEventListener("scroll", updateFan); window.removeEventListener("resize", updateFan); };
  }, [cards, fan]);
  const renderedIds = new Set<string>();
  const renderCard = (card: CardInstance) => <CardView key={card.instanceId} card={card} owner={owner} view={view} zone={zone} onMove={onMove} onTap={onTap} onDoubleTap={onDoubleTap} onDetails={onDetails} onMarkingMenuStart={onCardMarkingMenuStart} onMarkingMenuMove={onMarkingMenuMove} onMarkingMenuEnd={onMarkingMenuEnd} onOptions={onOptions} selected={selectedCards.has(card.instanceId)} inspected={inspection?.cardId === card.instanceId} inspectionViewer={inspection?.viewer} revealHiddenCards={revealHiddenCards} privateReveal={privateReveal} revealPublic={revealPublic} revealDeckToOwner={revealDeckToOwner} />;
  const renderStack = (stackId: string) => {
    const members = cards.filter((item) => item.stackId === stackId).sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
    members.forEach((item) => renderedIds.add(item.instanceId));
    const layout = members.find((item) => item.stackLayout)?.stackLayout ?? "diagonal";
    const placement = members.find((item) => item.stackPlacement)?.stackPlacement ?? "top";
    const visibleLimit = layout === "spread" ? 4 : 3;
    return <div className={`card-stack stack-${layout} stack-placement-${placement}`} data-stack-size={members.length} data-visible-count={Math.min(members.length, visibleLimit)} key={stackId}>{members.slice(-visibleLimit).map((member) => <CardView key={member.instanceId} card={member} owner={owner} view={view} zone={zone} onMove={onMove} onTap={onTap} onDoubleTap={onDoubleTap} onDetails={onDetails} onMarkingMenuStart={onCardMarkingMenuStart} onMarkingMenuMove={onMarkingMenuMove} onMarkingMenuEnd={onMarkingMenuEnd} onOptions={onOptions} selected={selectedCards.has(member.instanceId)} inspected={inspection?.cardId === member.instanceId} inspectionViewer={inspection?.viewer} revealHiddenCards={revealHiddenCards} privateReveal={privateReveal} revealPublic={revealPublic} revealDeckToOwner={revealDeckToOwner} />)}{members.length > visibleLimit ? <b className="card-stack-count">{members.length}</b> : null}</div>;
  };
  const cardNodes = revealDeckToOwner && zone === "deck" ? cards.map(renderCard) : cards.flatMap((card) => {
    if (renderedIds.has(card.instanceId)) return [];
    if (card.attachedToStackId && cards.some((item) => item.stackId === card.attachedToStackId)) return [];
    if (!card.stackId) return [renderCard(card)];
    const attachments = [...new Set(cards.filter((item) => item.attachedToStackId === card.stackId && item.stackLayout === "spread").map((item) => item.stackId!))];
    if (attachments.length) return [<div className="connected-stacks" key={card.stackId}>{renderStack(card.stackId)}{attachments.map(renderStack)}</div>];
    return [renderStack(card.stackId)];
  });
  const openedMembers = openedStack?.owner === owner && openedStack.zone === zone
    ? cards.filter((card) => card.stackId === openedStack.stackId).sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0))
    : [];
  return (
    <section
      className={`play-zone zone-${zone} ${fan ? "fan-expanded" : ""} ${fan && cards.length === 0 ? "empty-hand" : ""} ${openedMembers.length ? "has-open-stack" : ""}`}
      data-drop-owner={owner}
      data-drop-zone={zone}
      onClick={(event) => {
        const cardElement = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id]");
        if (!cardElement) onBackgroundTap?.();
        if (!onZoneSelect) return;
        const targetCard = cardElement ? cards.find((card) => card.instanceId === cardElement.dataset.cardId) : undefined;
        onZoneSelect(owner, zone, targetCard);
      }}
      ref={zoneRef}
    >
      {deckName ? <strong className="battle-deck-name">{deckName}</strong> : null}
      <strong className="play-zone-label">{zoneLabels[zone]}</strong>
      <span className="play-zone-count">{countZoneCards(cards)}</span>
      {zone === "reveal" && onToggleReveal ? <button aria-pressed={revealPublic} className={`reveal-publish-button ${revealPublic ? "is-public" : ""}`} onClick={(event) => { event.stopPropagation(); onToggleReveal(owner); }} type="button"><span aria-hidden="true" className="reveal-publish-icon" />{revealPublic ? "公開" : "非公開"}</button> : null}
      <div className="play-zone-cards" ref={cardsRef} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest(".play-card")) circlePoints.current = [{ x: event.clientX, y: event.clientY }]; }} onPointerMove={(event) => { if (circlePoints.current.length) circlePoints.current.push({ x: event.clientX, y: event.clientY }); }} onPointerUp={() => { const points = circlePoints.current; if (isCircleGesture(points)) onCircle(owner, zone); else if (points.length && Math.hypot(points.at(-1)!.x - points[0].x, points.at(-1)!.y - points[0].y) <= 8) { const now = performance.now(); if (now - lastEmptyTapAt.current <= 320) { lastEmptyTapAt.current = 0; onEmptyDoubleTap(owner, zone); } else lastEmptyTapAt.current = now; } circlePoints.current = []; }}>
        {cardNodes}
        {fan && cards.length === 0 ? <button className="empty-hand-target" onClick={(event) => { event.stopPropagation(); onZoneSelect?.(owner, "hand"); }} type="button">手札なし</button> : null}
      </div>
      {openedMembers.length ? <aside className="stack-inspector" data-operation-container="stack" onClick={(event) => event.stopPropagation()}><header><strong>束の内容</strong><div className="stack-inspector-actions"><button onClick={onCloseStack} type="button">閉じる</button><button onClick={() => onUnbundleStack?.(owner, zone, openedStack!.stackId)} type="button">束を解除</button></div></header><div className="play-zone-cards stack-inspector-cards">{openedMembers.map((member) => <CardView key={`inspector-${member.instanceId}`} card={member} owner={owner} view={view} zone={zone} individualFromStack onMove={(moveOwner, from, cardId, to, targetCardId, choice) => onMove(moveOwner, from, cardId, to, targetCardId, choice, true)} onTap={onTap} onDoubleTap={onDoubleTap} onDetails={onDetails} onMarkingMenuStart={onCardMarkingMenuStart} onMarkingMenuMove={onMarkingMenuMove} onMarkingMenuEnd={onMarkingMenuEnd} onOptions={onOptions} selected={selectedCards.has(member.instanceId)} inspected={inspection?.cardId === member.instanceId} inspectionViewer={inspection?.viewer} revealHiddenCards={revealHiddenCards} privateReveal={privateReveal} revealPublic={revealPublic} revealDeckToOwner={revealDeckToOwner} />)}</div></aside> : null}
    </section>
  );
}

type BattlePlayerProps = {
  activeAuxiliaryZone: PlayZone | null;
  board: BoardState;
  buttonsCollapsed?: boolean;
  collapsed: boolean;
  controlledPlayer: PlayerId;
  canViewDeck: boolean;
  deckName: string;
  format: string;
  owner: PlayerId;
  position: "top" | "bottom";
  view: PlayerId;
  onCollapse: () => void;
  onButtonsCollapse?: () => void;
  onDetails: (card: CardInstance) => void;
  onDraw: (owner: PlayerId) => void;
  onMove: ZoneProps["onMove"];
  onMarkingMenuStart: ZoneProps["onMarkingMenuStart"];
  onMarkingMenuMove: ZoneProps["onMarkingMenuMove"];
  onMarkingMenuEnd: ZoneProps["onMarkingMenuEnd"];
  onOptions: ZoneProps["onOptions"];
  onTap: ZoneProps["onTap"];
  onDoubleTap: ZoneProps["onDoubleTap"];
  onBackgroundTap: () => void;
  onUntapZone: (owner: PlayerId, zone: PlayZone) => void;
  onSelectAuxiliaryZone: (owner: PlayerId, zone: PlayZone) => void;
  onOpenExternalZones: (owner: PlayerId) => void;
  onZoneSelect?: ZoneProps["onZoneSelect"];
  selectedCards: Set<string>;
  openedStack: { owner: PlayerId; zone: PlayZone; stackId: string } | null;
  onCloseStack: () => void;
  onUnbundleStack: NonNullable<ZoneProps["onUnbundleStack"]>;
  onCircle?: ZoneProps["onCircle"];
  revealHiddenCards?: boolean;
  privateReveal?: boolean;
  onToggleReveal?: (owner: PlayerId) => void;
};

function DeckPile({ board, disabled, owner, onOptions, onDraw, onMove, onMarkingMenuStart, onMarkingMenuMove, onMarkingMenuEnd, onCircle, onZoneSelect }: { board: BoardState; disabled: boolean; owner: PlayerId; onOptions: ZoneProps["onOptions"]; onDraw: (owner: PlayerId) => void; onMove: ZoneProps["onMove"]; onMarkingMenuStart: ZoneProps["onMarkingMenuStart"]; onMarkingMenuMove: ZoneProps["onMarkingMenuMove"]; onMarkingMenuEnd: ZoneProps["onMarkingMenuEnd"]; onCircle: ZoneProps["onCircle"]; onZoneSelect?: ZoneProps["onZoneSelect"] }) {
  const fallback: CardInstance = { instanceId: "deck", canonicalCardId: 0, name: "山札", imageUrl: null, face: "face_down", tapped: false, shieldMarker: null };
  const timer = useRef<number | null>(null);
  const start = useRef<(GesturePoint & { at: number }) | null>(null);
  const points = useRef<GesturePoint[]>([]);
  const menuOpen = useRef(false);
  const dragActivated = useRef(false);
  const stackPreviewTimer = useRef<number | null>(null);
  const stackProgressTimer = useRef<number | null>(null);
  const stackPreviewCandidate = useRef<{ centerX: number; centerY: number; holdX: number; holdY: number; targetCardId: string; targetZone: PlayZone } | null>(null);
  const stackPreviewRef = useRef<{ centerX: number; centerY: number; targetCardId: string; targetZone: PlayZone } | null>(null);
  const card = board.players[owner].deck[0] ?? fallback;
  const [dragPreview, setDragPreview] = useState<DragPreviewState>(null);
  const [stackPreview, setStackPreview] = useState<typeof stackPreviewRef.current>(null);
  const [stackHoldProgress, setStackHoldProgress] = useState<{ x: number; y: number } | null>(null);
  const [longPressProgress, setLongPressProgress] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (stackPreviewTimer.current !== null) window.clearTimeout(stackPreviewTimer.current);
    if (stackProgressTimer.current !== null) window.clearTimeout(stackProgressTimer.current);
  }, []);
  function clearStackHold() {
    if (stackPreviewTimer.current !== null) window.clearTimeout(stackPreviewTimer.current);
    if (stackProgressTimer.current !== null) window.clearTimeout(stackProgressTimer.current);
    stackPreviewTimer.current = null;
    stackProgressTimer.current = null;
    stackPreviewCandidate.current = null;
    stackPreviewRef.current = null;
    setStackPreview(null);
    setStackHoldProgress(null);
  }
  function clearGesture() {
    start.current = null;
    points.current = [];
    menuOpen.current = false;
    dragActivated.current = false;
    setDragPreview(null);
    setLongPressProgress(null);
    clearDropGuide();
    clearStackHold();
  }
  return (
    <>
      <aside className="play-pile deck-pile" data-drop-owner={owner} data-drop-zone="deck">
        <button
          disabled={disabled || board.players[owner].deck.length === 0}
          onPointerCancel={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            clearGesture();
          }}
          onPointerDown={(event) => {
            clearDropGuide();
            start.current = { at: performance.now(), x: event.clientX, y: event.clientY };
            points.current = [start.current];
            menuOpen.current = false;
            dragActivated.current = false;
            setDragPreview(null);
            setLongPressProgress({ x: event.clientX, y: event.clientY });
            clearStackHold();
            event.currentTarget.setPointerCapture(event.pointerId);
            timer.current = window.setTimeout(() => {
              if (!start.current) return;
              menuOpen.current = true;
              setDragPreview(null);
              setLongPressProgress(null);
              onMarkingMenuStart(owner, "deck", card, start.current.x, start.current.y);
            }, readLongPressMs());
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            points.current.push({ x: event.clientX, y: event.clientY });
            if (menuOpen.current) {
              clearDropGuide();
              event.preventDefault();
              dragActivated.current = false;
              setDragPreview(null);
              onMarkingMenuMove(event.clientX, event.clientY);
              return;
            }
            const distance = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
            if (distance > 8) {
              dragActivated.current = true;
              setLongPressProgress(null);
              setDragPreview({ x: event.clientX, y: event.clientY, imageUrl: "/card-back.svg" });
              const elements = document.elementsFromPoint(event.clientX, event.clientY);
              const { targetCard, targetZone } = readDropHit(elements, owner, "deck", card.instanceId);
              showDropGuide(owner, stackPreviewRef.current?.targetZone ?? targetZone, elements);
              if (!stackPreviewRef.current) {
                const bounds = targetCard?.dataset.cardId ? targetCard.getBoundingClientRect() : null;
                const candidate = targetCard?.dataset.cardId && targetZone && bounds && !nonStackableZones.includes(targetZone)
                  ? { centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2, holdX: event.clientX, holdY: event.clientY, targetCardId: targetCard.dataset.cardId, targetZone }
                  : null;
                const previous = stackPreviewCandidate.current;
                const sameCandidate = Boolean(candidate && previous && candidate.targetCardId === previous.targetCardId && candidate.targetZone === previous.targetZone);
                if (!candidate) clearStackHold();
                else if (!sameCandidate) {
                  clearStackHold();
                  stackPreviewCandidate.current = candidate;
                  stackProgressTimer.current = window.setTimeout(() => {
                    const current = stackPreviewCandidate.current;
                    if (current) setStackHoldProgress({ x: current.holdX, y: current.holdY });
                    stackProgressTimer.current = null;
                  }, STACK_HOLD_PROGRESS_MS);
                  stackPreviewTimer.current = window.setTimeout(() => {
                    const current = stackPreviewCandidate.current;
                    setStackHoldProgress(null);
                    if (current) {
                      const preview = { centerX: current.centerX, centerY: current.centerY, targetCardId: current.targetCardId, targetZone: current.targetZone };
                      stackPreviewRef.current = preview;
                      setStackPreview(preview);
                    }
                    stackPreviewTimer.current = null;
                  }, STACK_HOLD_MENU_MS);
                }
              }
            }
            if (distance > 12 && timer.current !== null) {
              window.clearTimeout(timer.current);
              timer.current = null;
            }
          }}
          onPointerUp={(event) => {
            if (!start.current) return;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            if (menuOpen.current) {
              onMarkingMenuEnd(event.clientX, event.clientY);
              clearGesture();
              return;
            }
            if (isCircleGesture(points.current)) {
              onCircle(owner, "deck");
              clearGesture();
              return;
            }
            const gesture = resolvePointerReleaseGesture({
              distancePx: Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y),
              dragActivated: dragActivated.current,
              durationMs: performance.now() - start.current.at,
            });
            if (gesture === "drag") {
              const activeStackPreview = stackPreviewRef.current;
              if (activeStackPreview) {
                const dx = event.clientX - activeStackPreview.centerX;
                const dy = event.clientY - activeStackPreview.centerY;
                const optionDistance = Math.hypot(dx, dy);
                const outerCancelDistance = 2.5 * (48 + 3 * (100 - 48));
                if (optionDistance >= 48 && optionDistance <= outerCancelDistance) {
                  if (Math.abs(dx) > Math.abs(dy) * 2 && dx > 0) onMove(owner, "deck", card.instanceId, activeStackPreview.targetZone, activeStackPreview.targetCardId, "face_up_spread");
                  else onMove(owner, "deck", card.instanceId, activeStackPreview.targetZone, activeStackPreview.targetCardId, `${dx < 0 ? "face_down" : "face_up"}_${dy < 0 ? "top" : "bottom"}` as "face_up_top" | "face_down_top" | "face_up_bottom" | "face_down_bottom");
                }
                clearGesture();
                return;
              }
              const target = document.elementsFromPoint(event.clientX, event.clientY)
                .map((element) => element.closest<HTMLElement>("[data-drop-zone]"))
                .find((element) => element?.dataset.dropOwner === owner && element.dataset.dropZone !== "deck");
              const targetZone = target?.dataset.dropZone as PlayZone | undefined;
              if (targetZone && getMoveRule("deck", targetZone) !== "prohibited") onMove(owner, "deck", card.instanceId, targetZone);
            } else if (gesture === "tap" && !onZoneSelect?.(owner, "deck")) {
              onDraw(owner);
            }
            clearGesture();
          }}
          type="button"
        >
          <strong>山札</strong>
          <b>{countZoneCards(board.players[owner].deck)}</b>
        </button>
      </aside>
      <LongPressProgress durationMs={readLongPressMs()} label="山札の長押し操作が有効になるまでの残り時間" point={longPressProgress} />
      <CardDragPreview preview={dragPreview} />
      <StackHoldProgress point={stackHoldProgress} />
      {stackPreview ? <StackDestinationMarkingMenu menu={{ pointerX: dragPreview?.x ?? stackPreview.centerX, pointerY: dragPreview?.y ?? stackPreview.centerY, x: stackPreview.centerX, y: stackPreview.centerY }} /> : null}
    </>
  );
}

function AuxiliaryZoneButton({ active, board, disabled, owner, zone, onSelect }: { active: boolean; board: BoardState; disabled: boolean; owner: PlayerId; zone: PlayZone; onSelect: (owner: PlayerId, zone: PlayZone) => void }) {
  return <button aria-pressed={active} className={`auxiliary-zone-button auxiliary-zone-${zone}`} data-drop-owner={owner} data-drop-zone={zone} disabled={disabled} onClick={() => onSelect(owner, zone)} type="button"><strong>{zoneLabels[zone]}</strong><b>{countZoneCards(board.players[owner][zone])}</b></button>;
}

function ExternalZoneButton({ active, disabled, onOpen }: { active: boolean; disabled: boolean; onOpen: () => void }) {
  return <button aria-pressed={active} className="auxiliary-zone-button" disabled={disabled} onClick={onOpen} type="button"><strong>外部</strong></button>;
}

function GraveyardPile({ active, board, disabled, owner, onSelect, onZoneSelect }: { active: boolean; board: BoardState; disabled: boolean; owner: PlayerId; onSelect: (owner: PlayerId, zone: PlayZone) => void; onZoneSelect?: ZoneProps["onZoneSelect"] }) {
  return <aside className={`play-pile graveyard-pile ${active ? "active" : ""}`} data-drop-owner={owner} data-drop-zone="graveyard"><button disabled={disabled} onClick={() => { if (!onZoneSelect?.(owner, "graveyard")) onSelect(owner, "graveyard"); }} type="button"><strong>墓地</strong><b>{countZoneCards(board.players[owner].graveyard)}</b></button></aside>;
}

function BattlePlayer({ activeAuxiliaryZone, board, buttonsCollapsed = false, collapsed, controlledPlayer, canViewDeck, deckName, format, owner, position, view, onCollapse, onButtonsCollapse = () => undefined, onDetails, onDraw, onMove, onMarkingMenuStart, onMarkingMenuMove, onMarkingMenuEnd, onOptions, onSelectAuxiliaryZone, onOpenExternalZones, onTap, onDoubleTap, onBackgroundTap, onUntapZone, onZoneSelect, selectedCards, openedStack, onCloseStack, onUnbundleStack, onCircle = () => undefined, revealHiddenCards = false, privateReveal = false, onToggleReveal }: BattlePlayerProps) {
  const disabled = false;
  const zoneProps = { owner, view, onMove, onTap, onDoubleTap, onDetails, onMarkingMenuStart, onMarkingMenuMove, onMarkingMenuEnd, onOptions, selectedCards, onCircle, onEmptyDoubleTap: onUntapZone, onZoneSelect, onBackgroundTap, openedStack, onCloseStack, onUnbundleStack, inspection: board.inspection, revealHiddenCards, privateReveal, revealPublic: board.revealPublic?.[owner] ?? false, onToggleReveal: owner === controlledPlayer ? onToggleReveal : undefined };
  const displayedAuxiliaryZones = auxiliaryZones;
  const ownAuxiliaryButtonZones: PlayZone[] = format === "advanced"
    ? ["hyperspatial", "gr", "abyss", "reveal"]
    : ["hyperspatial", "abyss", "reveal"];
  const opponentButtonZones: PlayZone[] = ["hand", "mana", "reveal"];
  const externalActive = activeAuxiliaryZone !== null && externalZones.includes(activeAuxiliaryZone);
  return (
    <section className={`battle-player player-${owner} battle-player-${position} ${collapsed ? "collapsed" : ""}`}>
      {position === "top" ? <button aria-label={collapsed ? "相手側を広げる" : "相手側を引っ込める"} aria-expanded={!collapsed} className="opponent-collapse" onClick={onCollapse} type="button">{collapsed ? "▼" : "▲"}</button> : null}
      {collapsed ? <div className="collapsed-player-label"><strong>{owner === "p1" ? "プレイヤー1" : "プレイヤー2"}</strong><span>相手側を表示</span></div> : <div className="battle-player-content">
        {position === "top" ? <><div className={`opponent-buttons-section ${buttonsCollapsed ? "buttons-collapsed" : ""}`}>{!buttonsCollapsed ? <><div className="opponent-zone-buttons" style={{ gridTemplateColumns: `repeat(${opponentButtonZones.length + 1}, minmax(0, 1fr))` }}>{opponentButtonZones.map((zone) => <AuxiliaryZoneButton active={activeAuxiliaryZone === zone} board={board} disabled={disabled} key={zone} owner={owner} zone={zone} onSelect={onSelectAuxiliaryZone} />)}<ExternalZoneButton active={externalActive} disabled={disabled} onOpen={() => onOpenExternalZones(owner)} /></div>{activeAuxiliaryZone && (activeAuxiliaryZone === "deck" ? canViewDeck : [...opponentButtonZones, "graveyard", ...externalZones].includes(activeAuxiliaryZone)) ? <div className="battle-auxiliary-drawer opponent-drawer"><Zone {...zoneProps} cards={board.players[owner][activeAuxiliaryZone]} zone={activeAuxiliaryZone} revealDeckToOwner={activeAuxiliaryZone === "deck" && canViewDeck} /></div> : null}</> : null}<button aria-label={buttonsCollapsed ? "相手のボタン列を広げる" : "相手のボタン列を縮小する"} aria-expanded={!buttonsCollapsed} className="opponent-buttons-collapse" onClick={onButtonsCollapse} type="button">{buttonsCollapsed ? "▼" : "▲"}</button></div><div className="opponent-shield-row"><GraveyardPile active={activeAuxiliaryZone === "graveyard"} board={board} disabled={disabled} owner={owner} onSelect={onSelectAuxiliaryZone} onZoneSelect={onZoneSelect} /><DeckPile board={board} disabled={disabled} owner={owner} onCircle={onCircle} onDraw={onDraw} onMove={onMove} onMarkingMenuEnd={onMarkingMenuEnd} onMarkingMenuMove={onMarkingMenuMove} onMarkingMenuStart={onMarkingMenuStart} onOptions={onOptions} onZoneSelect={onZoneSelect} /><Zone {...zoneProps} cards={board.players[owner].shield} zone="shield" /></div></> : null}
        {position === "bottom" ? <><Zone {...zoneProps} cards={board.players[owner].battle} deckName={deckName} zone="battle" /><div className="battle-self-shield-row"><Zone {...zoneProps} cards={board.players[owner].shield} zone="shield" /><DeckPile board={board} disabled={disabled} owner={owner} onCircle={onCircle} onDraw={onDraw} onMove={onMove} onMarkingMenuEnd={onMarkingMenuEnd} onMarkingMenuMove={onMarkingMenuMove} onMarkingMenuStart={onMarkingMenuStart} onOptions={onOptions} onZoneSelect={onZoneSelect} /><GraveyardPile active={activeAuxiliaryZone === "graveyard"} board={board} disabled={disabled} owner={owner} onSelect={onSelectAuxiliaryZone} onZoneSelect={onZoneSelect} /></div><Zone {...zoneProps} cards={board.players[owner].mana} zone="mana" /><div className="battle-auxiliary-row"><div className="battle-auxiliary-buttons" style={{ gridTemplateColumns: `repeat(${ownAuxiliaryButtonZones.length}, minmax(0, 1fr))` }}>{ownAuxiliaryButtonZones.map((auxiliaryZone) => <AuxiliaryZoneButton active={activeAuxiliaryZone === auxiliaryZone} board={board} disabled={disabled} key={auxiliaryZone} owner={owner} zone={auxiliaryZone} onSelect={onSelectAuxiliaryZone} />)}</div></div>{activeAuxiliaryZone && (activeAuxiliaryZone === "deck" ? canViewDeck : [...displayedAuxiliaryZones, ...externalZones].includes(activeAuxiliaryZone)) ? <div className="battle-auxiliary-drawer"><Zone {...zoneProps} cards={board.players[owner][activeAuxiliaryZone]} zone={activeAuxiliaryZone} revealDeckToOwner={activeAuxiliaryZone === "deck" && canViewDeck} /></div> : null}<Zone {...zoneProps} cards={board.players[owner].hand} fan zone="hand" /></> : null}
        {position === "top" ? <Zone {...zoneProps} cards={board.players[owner].battle} deckName={deckName} zone="battle" /> : null}
      </div>}
    </section>
  );
}

type MarkingMenuState = {
  branch: "move" | "other" | null;
  card: CardInstance;
  owner: PlayerId;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  zone: PlayZone;
  items: typeof DEFAULT_MARKING_MENU_ITEMS;
};

type PendingDestinationStack = {
  cardId: string;
  from: PlayZone;
  owner: PlayerId;
  pointerX: number;
  pointerY: number;
  targetCardId: string;
  targetZone: PlayZone;
  x: number;
  y: number;
};

function getMarkingMenuGeometry(menu: MarkingMenuState, viewportWidth: number, viewportHeight: number) {
  const radius = viewportWidth <= 700 ? 86 : 104;
  const items = menu.branch === "other" ? getOtherContextualActions(menu.items) : menu.items;
  const positions = calculateMarkingMenuPositions(items, menu.x, viewportWidth, radius);
  const visualBounds = menu.branch === "move"
    ? calculateMarkingMenuBranchBounds(viewportWidth, viewportHeight)
    : calculateMarkingMenuVisualBounds(positions, viewportWidth);
  const center = calculateMarkingMenuCenter(menu.x, menu.y, viewportWidth, viewportHeight, visualBounds);
  return { center, positions, radius };
}

function getStackDestinationMenuGeometry(menu: StackDestinationGesture, viewportWidth: number, viewportHeight: number) {
  const radius = viewportWidth <= 700 ? 105 : 130;
  const positions = calculateStackDestinationPositions(radius);
  const visualBounds = calculateStackDestinationVisualBounds(positions, viewportWidth);
  const center = calculateMarkingMenuCenter(menu.x, menu.y, viewportWidth, viewportHeight, visualBounds);
  return { center, positions, radius };
}

function PageScrollRail() {
  const [metrics, setMetrics] = useState({ documentHeight: 1, scrollTop: 0, viewportHeight: 1 });
  const drag = useRef<{ maxScroll: number; startScroll: number; startY: number; usableTrack: number } | null>(null);

  useEffect(() => {
    function updateMetrics() {
      const root = document.documentElement;
      setMetrics({
        documentHeight: Math.max(root.scrollHeight, document.body.scrollHeight),
        scrollTop: window.scrollY,
        viewportHeight: window.innerHeight,
      });
    }
    updateMetrics();
    window.addEventListener("resize", updateMetrics);
    window.addEventListener("scroll", updateMetrics, { passive: true });
    return () => {
      window.removeEventListener("resize", updateMetrics);
      window.removeEventListener("scroll", updateMetrics);
    };
  }, []);

  const maxScroll = Math.max(0, metrics.documentHeight - metrics.viewportHeight);
  const thumbPercent = Math.max(8, Math.min(100, metrics.viewportHeight / metrics.documentHeight * 100));
  const topPercent = maxScroll === 0 ? 0 : metrics.scrollTop / maxScroll * (100 - thumbPercent);

  function jumpToPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || maxScroll === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    window.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const trackHeight = event.currentTarget.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
    const thumbHeight = event.currentTarget.getBoundingClientRect().height;
    drag.current = { maxScroll, startScroll: window.scrollY, startY: event.clientY, usableTrack: Math.max(1, trackHeight - thumbHeight) };
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const delta = event.clientY - drag.current.startY;
    window.scrollTo({ top: drag.current.startScroll + delta / drag.current.usableTrack * drag.current.maxScroll });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  }

  return (
    <div aria-label="ページスクロール" className="page-scroll-rail" onPointerDown={jumpToPointer} role="scrollbar" aria-valuemax={Math.round(maxScroll)} aria-valuemin={0} aria-valuenow={Math.round(metrics.scrollTop)}>
      <button
        aria-label="つまみを上下に動かして画面をスクロール"
        className="page-scroll-thumb"
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        style={{ height: `${thumbPercent}%`, top: `${topPercent}%` }}
        type="button"
      />
    </div>
  );
}

function MarkingMenu({
  menu,
  onAction,
  onClose,
  onMove,
}: {
  menu: MarkingMenuState;
  onAction: (action: MarkingMenuAction) => void;
  onClose: () => void;
  onMove: (zone: PlayZone) => void;
}) {
  const viewportWidth = typeof window === "undefined" ? 390 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 844 : window.innerHeight;
  const { center, positions, radius } = getMarkingMenuGeometry(menu, viewportWidth, viewportHeight);
  const gestureCancelled = isMarkingMenuGestureCancelled(menu.x, menu.y, menu.pointerX, menu.pointerY);
  const selected = menu.branch !== "move" && !gestureCancelled
    ? selectMarkingMenuItem(positions, menu.pointerX - center.x, menu.pointerY - center.y, undefined, radius)
    : null;
  const lineDelta = { x: menu.pointerX - center.x, y: menu.pointerY - center.y };
  const lineLength = Math.hypot(lineDelta.x, lineDelta.y);
  const lineAngle = Math.atan2(lineDelta.y, lineDelta.x) * 180 / Math.PI;

  return (
    <div className="marking-menu-backdrop" onPointerDown={onClose} role="presentation">
      <div
        aria-label={`${menu.card.name}の操作メニュー`}
        className="marking-menu"
        onPointerDown={(event) => event.stopPropagation()}
        role="menu"
        style={{ left: center.x, top: center.y }}
      >
        <span className="marking-menu-anchor" aria-hidden="true" />
        {menu.branch !== "move" ? <span className="marking-menu-pointer-line" aria-hidden="true" style={{ transform: `rotate(${lineAngle}deg)`, width: lineLength }} /> : null}
        {menu.branch === null && selected?.action === "yobinion" && lineLength >= 170 ? <span className="dragon-yobinion-branch" style={{ left: Math.cos(lineAngle * Math.PI / 180) * 190, top: Math.sin(lineAngle * Math.PI / 180) * 190 }}>ドラゴンヨビニオン</span> : null}
        {menu.branch === "move" ? (
          <div className="marking-menu-branch">
            <strong>移動先</strong>
            <div>
              {moveDestinationZones
                .filter((zone) => getMoveRule(menu.zone, zone) !== "prohibited")
                .map((zone) => <button key={zone} onClick={() => onMove(zone)} role="menuitem" type="button">{zoneLabels[zone]}</button>)}
            </div>
            <button className="marking-menu-back" onClick={() => onAction("move")} type="button">戻る</button>
          </div>
        ) : positions.map((item) => (
          <button
            className={`marking-menu-option ${selected?.slot === item.slot ? "selected" : ""}`}
            key={item.slot}
            onClick={() => onAction(item.action)}
            role="menuitem"
            style={{ left: item.x, top: item.y }}
            type="button"
          >
            <small>{item.slot}</small>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StackDestinationMarkingMenu({ menu }: { menu: StackDestinationGesture }) {
  if (typeof document === "undefined") return null;
  const viewportWidth = typeof window === "undefined" ? 390 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 844 : window.innerHeight;
  const { center, positions, radius } = getStackDestinationMenuGeometry(menu, viewportWidth, viewportHeight);
  const gestureCancelled = isMarkingMenuGestureCancelled(menu.x, menu.y, menu.pointerX, menu.pointerY);
  const selected = gestureCancelled
    ? null
    : selectStackDestinationItem(positions, menu.pointerX - center.x, menu.pointerY - center.y, undefined, radius);
  const lineDelta = { x: menu.pointerX - center.x, y: menu.pointerY - center.y };
  const lineLength = Math.hypot(lineDelta.x, lineDelta.y);
  const lineAngle = Math.atan2(lineDelta.y, lineDelta.x) * 180 / Math.PI;

  return createPortal(
    <div className="marking-menu-backdrop stack-destination-backdrop" role="presentation">
      <div aria-label="カードを重ねる方法" className="marking-menu stack-destination-marking-menu" role="menu" style={{ left: center.x, top: center.y }}>
        <span className="marking-menu-anchor" aria-hidden="true" />
        <span className="marking-menu-pointer-line" aria-hidden="true" style={{ transform: `rotate(${lineAngle}deg)`, width: lineLength }} />
        {positions.map((item) => (
          <div
            aria-label={item.label}
            className={`stack-destination-option stack-destination-${item.action} ${selected?.action === item.action ? "selected" : ""}`}
            key={item.action}
            role="menuitem"
            style={{ left: item.x, top: item.y }}
          >
            <span className={`stack-destination-asset-crop ${item.action === "spread" ? "spread" : ""}`}>
              <img alt="" aria-hidden="true" src={item.asset} />
            </span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function TargetArrows({ sourceId, targetIds }: { sourceId: string; targetIds: string[] }) {
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  useEffect(() => {
    function update() {
      const source = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(sourceId)}"]`);
      if (!source) return setLines([]);
      const from = source.getBoundingClientRect();
      setLines(targetIds.flatMap((id) => {
        const target = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`);
        if (!target) return [];
        const to = target.getBoundingClientRect();
        return [{ x1: from.left + from.width / 2, y1: from.top + from.height / 2, x2: to.left + to.width / 2, y2: to.top + to.height / 2 }];
      }));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [sourceId, targetIds]);
  return <svg aria-hidden="true" className="target-arrows"><defs><marker id="target-arrow-head" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5"><path d="M0 0L7 3.5L0 7Z" /></marker></defs>{lines.map((line, index) => <line key={index} markerEnd="url(#target-arrow-head)" {...line} />)}</svg>;
}

export type CardInteractionSignal = { active: boolean; cardId: string };
export type RemoteCardInteraction = { cardId: string; displayName: string; player: PlayerId };

function RemoteCardInteractionIndicator({ interaction }: { interaction: RemoteCardInteraction | null }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const selector = interaction ? `[data-card-id="${CSS.escape(interaction.cardId)}"]` : null;
    const elements = selector ? [...document.querySelectorAll<HTMLElement>(selector)] : [];
    function update() {
      const element = elements.find((candidate) => candidate.getClientRects().length > 0);
      if (!element) return setPosition(null);
      const bounds = element.getBoundingClientRect();
      setPosition({ left: bounds.left + bounds.width / 2, top: bounds.top - 8 });
    }
    const playerClass = interaction ? `remote-card-operation-${interaction.player}` : "";
    elements.forEach((element) => element.classList.add("remote-card-operation", playerClass));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      elements.forEach((element) => element.classList.remove("remote-card-operation", playerClass));
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [interaction]);
  if (!interaction || !position) return null;
  return <span className={`remote-operation-label remote-operation-${interaction.player}`} style={position}>{interaction.displayName}が操作中</span>;
}

export function PlaytestBoard({ cards, opponentCards, deckName, deckFormat = "original", opponentDeckName, opponentDeckFormat, initialState, externalState, localPlayer, onStateChange, onCardInteractionChange, onNonScrollInteraction, onShuffleRequest, onYobinionRequest, onInspectionRequest, onEffectWarningRequest, readOnly = false, remoteCardInteraction = null, revealHiddenCards = false, initialOpponentCollapsed = true, initialOpponentAuxiliaryZone = "hand", resetLabel, onResetRequest, canExternalUndo = false, canExternalRedo = false, onExternalUndo, onExternalRedo, externalHistoryBusy = false, onlineReveal = false }: { cards: DeckCard[]; opponentCards?: DeckCard[]; deckName: string; deckFormat?: string; opponentDeckName?: string; opponentDeckFormat?: string; initialState: BoardState; externalState?: BoardState; localPlayer?: PlayerId; onStateChange?: (state: BoardState) => void; onCardInteractionChange?: (signal: CardInteractionSignal) => void; onNonScrollInteraction?: () => void; onShuffleRequest?: (request: ServerShuffleRequest) => void; onYobinionRequest?: (request: ServerYobinionRequest) => void; onInspectionRequest?: (request: ServerInspectionRequest | null) => void; onEffectWarningRequest?: (request: ServerEffectWarningRequest) => void; readOnly?: boolean; remoteCardInteraction?: RemoteCardInteraction | null; revealHiddenCards?: boolean; initialOpponentCollapsed?: boolean; initialOpponentAuxiliaryZone?: PlayZone | null; resetLabel?: string; onResetRequest?: () => void; canExternalUndo?: boolean; canExternalRedo?: boolean; onExternalUndo?: () => void; onExternalRedo?: () => void; externalHistoryBusy?: boolean; onlineReveal?: boolean }) {
  const [board, setBoard] = useState<BoardState>(() => resolvePlaytestInitialState(initialState, externalState));
  const [past, setPast] = useState<BoardState[]>([]);
  const [future, setFuture] = useState<BoardState[]>([]);
  const usesExternalHistory = Boolean(onExternalUndo || onExternalRedo);
  const [perspective, setPerspective] = useState<PlayerId>(localPlayer ?? "p1");
  const [opponentCollapsed, setOpponentCollapsed] = useState(initialOpponentCollapsed);
  const [opponentButtonsCollapsed, setOpponentButtonsCollapsed] = useState(false);
  const [activeAuxiliaryZones, setActiveAuxiliaryZones] = useState<Record<PlayerId, PlayZone | null>>(() => ({ p1: (localPlayer ?? "p1") === "p1" ? "hand" : initialOpponentAuxiliaryZone, p2: (localPlayer ?? "p1") === "p2" ? "hand" : initialOpponentAuxiliaryZone }));
  const [detail, setDetail] = useState<CardInstance | null>(null);
  const [menu, setMenu] = useState<{ owner: PlayerId; zone: PlayZone; card: CardInstance } | null>(null);
  const [markingMenu, setMarkingMenu] = useState<MarkingMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [longPressMs, setLongPressMs] = useState(460);
  const [pendingDeckMove, setPendingDeckMove] = useState<{ cardId: string; from: PlayZone; owner: PlayerId; x: number; y: number; height: number; individual?: boolean } | null>(null);
  const [pendingStackMove, setPendingStackMove] = useState<{ cardId: string; from: PlayZone; owner: PlayerId; targetCardId: string; targetZone: PlayZone; individual?: boolean } | null>(null);
  const [pendingDestinationStack, setPendingDestinationStack] = useState<PendingDestinationStack | null>(null);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(() => new Set());
  const [markerTarget, setMarkerTarget] = useState<{ cardId: string; owner: PlayerId; zone: PlayZone } | null>(null);
  const markerTap = useRef<{ x: number; y: number; time: number } | null>(null);
  const markerPointerDown = useRef<{ x: number; y: number } | null>(null);
  const [targetSource, setTargetSource] = useState<{ cardId: string; owner: PlayerId } | null>(null);
  const [yobinionSourceMode, setYobinionSourceMode] = useState<{ owner: PlayerId; dragon: boolean } | null>(null);
  const [privateZoneConfirm, setPrivateZoneConfirm] = useState<{ owner: PlayerId; zone: PlayZone; card: CardInstance } | null>(null);
  const [inspectionConfirm, setInspectionConfirm] = useState<{ owner: PlayerId; cardId: string } | null>(null);
  const [deckViewConfirm, setDeckViewConfirm] = useState<PlayerId | null>(null);
  const [externalZonePickerOwner, setExternalZonePickerOwner] = useState<PlayerId | null>(null);
  const [pendingMoveSelection, setPendingMoveSelection] = useState<{ cardId: string; from: PlayZone; owner: PlayerId } | null>(null);
  const [pendingZoneCardChoice, setPendingZoneCardChoice] = useState<{ targetCardId: string; targetZone: PlayZone } | null>(null);
  const [openedStack, setOpenedStack] = useState<{ owner: PlayerId; zone: PlayZone; stackId: string } | null>(null);
  const [dynamicBottomClearance, setDynamicBottomClearance] = useState(0);
  const [otherBranchProgress, setOtherBranchProgress] = useState<{ x: number; y: number } | null>(null);
  const markingPointerFrame = useRef<number | null>(null);
  const queuedMarkingPointer = useRef<{ x: number; y: number } | null>(null);
  const otherBranchTimer = useRef<number | null>(null);
  const interactionCardId = useRef<string | null>(null);
  const interactionScrolled = useRef(false);
  const displayPlayers = perspective === "p1" ? [...playerIds].reverse() : [...playerIds];
  const controlledPlayer = localPlayer ?? perspective;
  const visibilityPlayer = localPlayer ?? perspective;
  const deckNames: Record<PlayerId, string> = { p1: deckName, p2: opponentDeckName ?? deckName };
  const deckFormats: Record<PlayerId, string> = { p1: deckFormat, p2: opponentDeckFormat ?? deckFormat };

  useEffect(() => {
    if (externalState) setBoard(externalState);
  }, [externalState]);
  useEffect(() => {
    const inspection = board.inspection;
    if (!inspection || inspection.viewer !== controlledPlayer) return;
    const clearOnNextScreenPointer = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId === inspection.cardId) return;
      updateInspection(null);
    };
    document.addEventListener("pointerdown", clearOnNextScreenPointer, true);
    return () => document.removeEventListener("pointerdown", clearOnNextScreenPointer, true);
  }, [board.inspection?.cardId, board.inspection?.viewer, controlledPlayer]);
  useEffect(() => setLongPressMs(readLongPressMs()), []);
  useEffect(() => () => {
    if (markingPointerFrame.current !== null) window.cancelAnimationFrame(markingPointerFrame.current);
    if (otherBranchTimer.current !== null) window.clearTimeout(otherBranchTimer.current);
  }, []);
  useEffect(() => {
    const fields = document.querySelector<HTMLElement>(".rough-battle-board .battle-fields");
    const fixedHand = document.querySelector<HTMLElement>(".battle-player-bottom .zone-hand");
    const fixedHandCards = document.querySelector<HTMLElement>(".battle-player-bottom .zone-hand .play-zone-cards");
    const navigation = document.querySelector<HTMLElement>(".primary-navigation");
    const boardElement = fields?.parentElement;
    if (!fields || !fixedHand || !boardElement) return;
    let frame = 0;
    const update = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const navRect = navigation?.getBoundingClientRect();
      const navHeight = navRect && navRect.bottom >= viewportHeight - 1 ? Math.max(0, viewportHeight - navRect.top) : 0;
      boardElement.style.setProperty("--battle-bottom-ui-height", `${navHeight}px`);
      const handRect = fixedHand.getBoundingClientRect();
      const visibleCards = [...(fixedHandCards?.children ?? [])].filter((child) =>
        child instanceof HTMLElement && child.matches(".play-card,.card-stack,.connected-stacks"),
      );
      const cardsClipTop = fixedHandCards?.getBoundingClientRect().top ?? handRect.top;
      const handTop = visibleCards.length > 0
        ? Math.min(...visibleCards.map((card) => Math.max(cardsClipTop, card.getBoundingClientRect().top)))
        : handRect.top;
      const main = boardElement.closest("main");
      const mainBottomPadding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      // At the end of document scroll, the field's last edge should meet the visible hand's top.
      setDynamicBottomClearance(Math.max(0, Math.ceil(viewportHeight - handTop - mainBottomPadding)));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    const observer = new ResizeObserver(schedule);
    [fields, fixedHand, fixedHandCards, navigation].forEach((element) => { if (element) observer.observe(element); });
    const mutations = new MutationObserver(schedule);
    mutations.observe(fields, { attributes: true, attributeFilter: ["class", "style"], childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [opponentCollapsed, opponentButtonsCollapsed, activeAuxiliaryZones, displayPlayers[0], board, openedStack]);

  function commit(update: (current: BoardState) => BoardState) {
    if (readOnly) return;
    setBoard((current) => {
      const next = update(current);
      if (next === current) return current;
      if (!usesExternalHistory) {
        setPast((items) => [...items.slice(-49), current]);
        setFuture([]);
      }
      onStateChange?.(next);
      return next;
    });
  }

  function updateInspection(inspection: BoardState["inspection"]) {
    if (readOnly) return;
    if (onInspectionRequest) {
      onInspectionRequest(inspection ? { owner: inspection.owner, cardId: inspection.cardId } : null);
      return;
    }
    setBoard((current) => {
      if (current.inspection?.cardId === inspection?.cardId && current.inspection?.owner === inspection?.owner && current.inspection?.viewer === inspection?.viewer) return current;
      const next = { ...current, inspection };
      onStateChange?.(next);
      return next;
    });
  }

  function clearOtherBranchTimer() {
    if (otherBranchTimer.current !== null) window.clearTimeout(otherBranchTimer.current);
    otherBranchTimer.current = null;
    setOtherBranchProgress(null);
  }

  function selectCurrentMarkingItem(menuState: MarkingMenuState, x: number, y: number) {
    if (isMarkingMenuGestureCancelled(menuState.x, menuState.y, x, y)) return null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { center, positions, radius } = getMarkingMenuGeometry(menuState, viewportWidth, viewportHeight);
    return selectMarkingMenuItem(positions, x - center.x, y - center.y, undefined, radius);
  }

  function notifyOpponent(current: BoardState, owner: PlayerId, message: string) {
    const recipient: PlayerId = owner;
    return { ...current, notifications: [...(current.notifications ?? []), { id: `${Date.now()}-${Math.random()}`, recipient, message, createdAt: Date.now() }].slice(-20) };
  }

  function toggleReveal(owner: PlayerId) {
    if (!onlineReveal || readOnly || owner !== localPlayer) return;
    commit((current) => toggleRevealPublic(current, owner));
  }

  function moveCard(owner: PlayerId, from: PlayZone, cardId: string, to: PlayZone, targetCardId?: string, choice?: "deck_top" | "deck_bottom" | "face_up_top" | "face_down_top" | "face_up_bottom" | "face_down_bottom" | "face_up_spread", individual = false) {
    if (localPlayer && owner !== localPlayer) setInteractionNotice("相手のカードを操作しています");
    if (getMoveRule(from, to) === "prohibited" && !(targetCardId && from === "battle" && to === "battle") && !(individual && from === "battle" && to === "battle")) return;
    if (targetCardId) {
      const pending = { cardId, from, owner, targetCardId, targetZone: to, individual };
      if (choice === "face_up_spread") commitStackMove("face_up", "bottom", pending, "spread");
      else if (choice?.startsWith("face_")) commitStackMove(choice.includes("face_up") ? "face_up" : "face_down", choice.endsWith("top") ? "top" : "bottom", pending);
      else commitStackMove("face_up", "top", pending);
      return;
    }
    if (to === "deck") {
      if (choice === "deck_top" || choice === "deck_bottom") {
        commitMove(owner, from, cardId, to, choice === "deck_top" ? "top" : "bottom", individual);
        return;
      }
      const deckElement = document.querySelector<HTMLElement>(`[data-drop-owner="${owner}"][data-drop-zone="deck"]`);
      const bounds = deckElement?.getBoundingClientRect();
      setPendingDeckMove({ cardId, from, owner, x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2, y: bounds?.top ?? window.innerHeight / 2, height: bounds?.height ?? 80, individual });
      setMenu(null);
      return;
    }
    commitMove(owner, from, cardId, to, "bottom", individual);
    setMenu(null);
  }

  function commitMove(owner: PlayerId, from: PlayZone, cardId: string, to: PlayZone, placement: "top" | "bottom", individual = false) {
    commit((current) => {
      const ids = individual ? new Set([cardId]) : selectedCards.has(cardId)
        ? new Set(selectedCards)
        : resolveDraggedCardIds(current.players[owner][from], cardId);
      const movedCount = current.players[owner][from].filter((card) => ids.has(card.instanceId)).length;
      if (movedCount === 0) return current;
      let next = individual && from === "battle" && to === "battle"
        ? detachCardFromStack(current, owner, from, cardId)
        : moveCardsBetweenZones(current, owner, from, to, ids, placement, Boolean(localPlayer));
      if (localPlayer && owner !== localPlayer && from !== to) next = notifyOpponent(next, owner, `相手があなたのカード${movedCount > 1 ? `${movedCount}枚を` : "を"}${zoneLabels[to]}へ移動しました`);
      return next;
    });
    setSelectionMode(false);
    setSelectedCards(new Set());
  }

  function commitStackMove(face: CardFace, placement: "top" | "bottom", explicit?: NonNullable<typeof pendingStackMove>, layout: "diagonal" | "spread" = "diagonal") {
    const pending = explicit ?? pendingStackMove;
    if (!pending) return;
    commit((current) => {
      const source = current.players[pending.owner][pending.from];
      const moving = source.find((card) => card.instanceId === pending.cardId);
      const targetCards = current.players[pending.owner][pending.targetZone];
      const target = targetCards.find((card) => card.instanceId === pending.targetCardId);
      if (!moving || !target) return current;
      const movingIds = pending.individual ? new Set([moving.instanceId]) : resolveDraggedCardIds(source, moving.instanceId);
      if (movingIds.has(target.instanceId)) return current;
      const movingCards = source.filter((card) => movingIds.has(card.instanceId)).sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
      if (layout === "diagonal") {
        const stacked = stackOnHorizontalRoot(
          [...targetCards.filter((card) => !movingIds.has(card.instanceId)), ...movingCards], target, movingIds, face, placement,
        );
        if (stacked) {
          const player = current.players[pending.owner];
          const movedStack = pending.from === pending.targetZone ? stacked : stacked.map((card) => movingIds.has(card.instanceId) ? { ...card, markers: [] } : card);
          return { ...current, players: { ...current.players, [pending.owner]: pending.from === pending.targetZone
            ? { ...player, [pending.targetZone]: stacked }
            : { ...player, [pending.from]: source.filter((card) => !movingIds.has(card.instanceId)), [pending.targetZone]: movedStack } } };
        }
      }
      const targetIsVertical = Boolean(target.stackId && target.stackLayout !== "spread");
      const attachTo = layout === "spread" && targetIsVertical ? target.stackId : target.attachedToStackId;
      const attachedSpreadId = layout === "spread" && targetIsVertical ? findAttachedSpreadStackId(targetCards, target.stackId!) : null;
      const stackId = layout === "spread" && targetIsVertical
        ? attachedSpreadId ?? `spread-${target.stackId}`
        : target.stackId ?? `stack-${target.instanceId}`;
      const existing = targetCards.filter((card) => (layout === "spread" && targetIsVertical
        ? card.attachedToStackId === target.stackId && card.stackLayout === "spread"
        : card.stackId === stackId || card.instanceId === target.instanceId) && !movingIds.has(card.instanceId)).sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
      const combined = placement === "top" ? [...existing, ...movingCards] : [...movingCards, ...existing];
      const stackMembers = new Map(combined.map((card, index) => [card.instanceId, { ...card, face: card.instanceId === moving.instanceId ? face : card.face, markers: (layout === "diagonal" && index !== combined.length - 1) || (pending.from !== pending.targetZone && movingIds.has(card.instanceId)) ? [] : card.markers, stackId, stackOrder: index, stackLayout: layout, stackPlacement: placement, attachedToStackId: attachTo ?? null }]));
      const memberIds = new Set(combined.map((card) => card.instanceId));
      let inserted = false;
      const rebuiltTarget = targetCards.flatMap((card) => {
        if (layout === "spread" && targetIsVertical && !attachedSpreadId && movingIds.has(card.instanceId)) return [];
        if (!memberIds.has(card.instanceId)) return [card];
        if (inserted) return [];
        inserted = true;
        return combined.map((member) => stackMembers.get(member.instanceId)!);
      });
      if (layout === "spread" && targetIsVertical && !attachedSpreadId) rebuiltTarget.push(...combined.map((member) => stackMembers.get(member.instanceId)!));
      const player = current.players[pending.owner];
      const remainingSource = source.filter((card) => !movingIds.has(card.instanceId));
      return { ...current, players: { ...current.players, [pending.owner]: pending.from === pending.targetZone
        ? { ...player, [pending.targetZone]: rebuiltTarget }
        : { ...player, [pending.from]: remainingSource.map((card) =>
          card.stackId === moving.stackId && remainingSource.filter((member) => member.stackId === moving.stackId).length === 1 && !hasConnectedStack(remainingSource, card)
            ? { ...card, stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null }
            : card), [pending.targetZone]: rebuiltTarget } } };
    });
    setPendingStackMove(null);
  }

  function closeDestinationStack() {
    setPendingDestinationStack(null);
    setPendingMoveSelection(null);
    setInteractionNotice(null);
  }

  function commitDestinationStack(face: CardFace, placement: "top" | "bottom", layout: "diagonal" | "spread" = "diagonal") {
    if (!pendingDestinationStack) return;
    commitStackMove(face, placement, pendingDestinationStack, layout);
    closeDestinationStack();
  }

  function commitStackDestinationAction(action: StackDestinationAction) {
    if (action === "face_down_top") commitDestinationStack("face_down", "top");
    if (action === "face_up_top") commitDestinationStack("face_up", "top");
    if (action === "face_down_bottom") commitDestinationStack("face_down", "bottom");
    if (action === "face_up_bottom") commitDestinationStack("face_up", "bottom");
    if (action === "spread") commitDestinationStack("face_up", "bottom", "spread");
  }

  function toggleTap(owner: PlayerId, zone: PlayZone, cardId: string) {
    if (localPlayer && owner !== localPlayer) setInteractionNotice("相手のカードを操作しています");
    if (zone === "deck" || zone === "hand" || zone === "shield") return;
    commit((current) => toggleCardTapWithProductionShadow(current, owner, zone, cardId, { clearKeepTappedOnUntap: true }));
  }

  function executeYobinion(owner: PlayerId, sourceId: string, dragonOnly: boolean) {
    if (onYobinionRequest) {
      onYobinionRequest({ owner, sourceId, dragonOnly });
      return;
    }
    commit((current) => {
      const next = runYobinion(current, owner, sourceId, dragonOnly);
      setInteractionNotice(next === current ? "ヨビニオンの対象が見つかりませんでした" : "ヨビニオンで対象をバトルゾーンへ移動しました");
      return next;
    });
  }

  function handleCardTap(owner: PlayerId, zone: PlayZone, cardId: string) {
    if (pendingMoveSelection) return;
    if (yobinionSourceMode) {
      if (zone === "battle" && owner === yobinionSourceMode.owner) executeYobinion(owner, cardId, yobinionSourceMode.dragon);
      setYobinionSourceMode(null);
      return;
    }
    if (selectionMode || targetSource) {
      setSelectedCards((current) => { const next = new Set(current); if (next.has(cardId)) next.delete(cardId); else next.add(cardId); return next; });
      return;
    }
    toggleTap(owner, zone, cardId);
  }

  function handleCardDoubleTap(owner: PlayerId, zone: PlayZone, card: CardInstance) {
    if (selectionMode) {
      const cardsInContainer = openedStack?.owner === owner && openedStack.zone === zone && card.stackId === openedStack.stackId
        ? board.players[owner][zone].filter((item) => item.stackId === openedStack.stackId)
        : board.players[owner][zone];
      setSelectedCards(new Set(cardsInContainer.map((item) => item.instanceId)));
      return;
    }
    if (owner !== visibilityPlayer && (zone === "hand" || zone === "deck")) openOptions(owner, zone, card);
    else setDetail(card);
  }

  function exitMultiSelect() {
    if (!selectionMode) return;
    setSelectionMode(false);
    setSelectedCards(new Set());
  }

  function updateMarker(target: NonNullable<typeof markerTarget>, marker: CardMarker, enabled: boolean) {
    if (localPlayer && target.owner !== localPlayer) setInteractionNotice("相手のカードを操作しています");
    commit((current) => {
      const next = setCardMarker(current, target.owner, target.zone, target.cardId, marker, enabled);
      return localPlayer && target.owner !== localPlayer ? notifyOpponent(next, target.owner, "相手があなたのカードのマーキングを変更しました") : next;
    });
  }

  function clearMarkers(target: NonNullable<typeof markerTarget>) {
    commit((current) => {
      const next = clearCardMarkers(current, target.owner, target.zone, target.cardId);
      if (next === current) return current;
      return localPlayer && target.owner !== localPlayer ? notifyOpponent(next, target.owner, "相手があなたのカードのマーキングを変更しました") : next;
    });
  }

  function setCardFace(owner: PlayerId, zone: PlayZone, cardId: string, face: CardFace) {
    if (localPlayer && owner !== localPlayer) setInteractionNotice("相手のカードを操作しています");
    commit((current) => ({
      ...current,
      players: {
        ...current.players,
        [owner]: {
          ...current.players[owner],
          [zone]: current.players[owner][zone].map((card) => card.instanceId === cardId ? { ...card, face } : card),
        },
      },
    }));
  }

  function flipCards(owner: PlayerId, zone: PlayZone, ids: ReadonlySet<string>) {
    commit((current) => ({ ...current, players: { ...current.players, [owner]: { ...current.players[owner], [zone]: current.players[owner][zone].map((card) => ids.has(card.instanceId) ? { ...card, face: card.face === "face_down" ? "face_up" : "face_down" } : card) } } }));
  }

  function markingMenuAction(action: MarkingMenuAction) {
    if (!markingMenu) return;
    if (action === "move") {
      if (markingMenu.card.stackId) {
        const stackIds = board.players[markingMenu.owner][markingMenu.zone].filter((card) => card.stackId === markingMenu.card.stackId).map((card) => card.instanceId);
        if (stackIds.length > 1) setSelectedCards(new Set(stackIds));
      }
      setPendingMoveSelection({ cardId: markingMenu.card.instanceId, from: markingMenu.zone, owner: markingMenu.owner });
      setInteractionNotice("移動先のゾーンをタップしてください");
      setMarkingMenu(null);
      return;
    }
    if (action === "other") {
      setMarkingMenu(null);
      return;
    }
    if (action === "details") setDetail(markingMenu.card);
    if (action === "inspect") setInspectionConfirm({ cardId: markingMenu.card.instanceId, owner: markingMenu.owner });
    if (action === "view_deck" && !readOnly && markingMenu.owner === visibilityPlayer) setDeckViewConfirm(markingMenu.owner);
    if (action === "publish") setCardFace(markingMenu.owner, markingMenu.zone, markingMenu.card.instanceId, "face_up");
    if (action === "toggle_tap") commit((current) => toggleCardTapWithProductionShadow(current, markingMenu.owner, markingMenu.zone, markingMenu.card.instanceId, { clearKeepTappedOnUntap: false }));
    if (action === "face_up") setCardFace(markingMenu.owner, markingMenu.zone, markingMenu.card.instanceId, "face_up");
    if (action === "face_down") setCardFace(markingMenu.owner, markingMenu.zone, markingMenu.card.instanceId, "face_down");
    if (action === "flip") {
      const ids = selectedCards.size > 1 && selectedCards.has(markingMenu.card.instanceId)
        ? selectedCards
        : markingMenu.card.stackId
          ? new Set(board.players[markingMenu.owner][markingMenu.zone].filter((card) => card.stackId === markingMenu.card.stackId).map((card) => card.instanceId))
          : new Set([markingMenu.card.instanceId]);
      flipCards(markingMenu.owner, markingMenu.zone, ids);
    }
    if (action === "flip_stack" && markingMenu.card.stackId) commit((current) => flipStackCards(current, markingMenu.owner, markingMenu.zone, markingMenu.card.stackId!));
    if (action === "multi_select") {
      const ids = markingMenu.card.stackId
        ? board.players[markingMenu.owner][markingMenu.zone].filter((card) => card.stackId === markingMenu.card.stackId).map((card) => card.instanceId)
        : [markingMenu.card.instanceId];
      setSelectionMode(true); setSelectedCards(new Set(ids));
    }
    if (action === "deselect") { setSelectionMode(false); setSelectedCards(new Set()); }
    if (action === "bundle") commit((current) => bundleSelectedCards(current, selectedCards));
    if (action === "open_stack" && markingMenu.card.stackId) setOpenedStack({ owner: markingMenu.owner, zone: markingMenu.zone, stackId: markingMenu.card.stackId });
    if (action === "unbundle_stack" && markingMenu.card.stackId) {
      commit((current) => unbundleStack(current, markingMenu.owner, markingMenu.zone, markingMenu.card.stackId!));
      setOpenedStack(null);
    }
    if (action === "mark" && markingMenu.zone === "battle") setMarkerTarget({ cardId: markingMenu.card.instanceId, owner: markingMenu.owner, zone: markingMenu.zone });
    if (action === "mark" && markingMenu.zone === "shield") updateMarker({ cardId: markingMenu.card.instanceId, owner: markingMenu.owner, zone: markingMenu.zone }, "shield_force", true);
    if (action === "mark_general") setMarkerTarget({ cardId: markingMenu.card.instanceId, owner: markingMenu.owner, zone: markingMenu.zone });
    if (action === "target") { setTargetSource({ cardId: markingMenu.card.instanceId, owner: markingMenu.owner }); setSelectedCards(new Set()); }
    if (action === "shuffle" && selectedCards.size > 1) {
      const shuffledIds = [...selectedCards];
      if (onShuffleRequest) onShuffleRequest({ owner: markingMenu.owner, zone: markingMenu.zone, mode: "selection", cardIds: shuffledIds });
      else commit((current) => shuffleSelectedCards(current, selectedCards));
      animateShuffleFeedback(() => cardShuffleFeedbackTargets(shuffledIds));
    }
    if (action === "shuffle" && markingMenu.zone === "deck") shuffleDeck(markingMenu.owner);
    if (action === "shuffle_stack" && markingMenu.card.stackId) {
      const shuffledId = markingMenu.card.instanceId;
      if (onShuffleRequest) onShuffleRequest({ owner: markingMenu.owner, zone: markingMenu.zone, mode: "stack", stackId: markingMenu.card.stackId });
      else commit((current) => shuffleStackCards(current, markingMenu.owner, markingMenu.zone, markingMenu.card.stackId!));
      animateShuffleFeedback(() => cardShuffleFeedbackTargets([shuffledId]));
    }
    if (action === "yobinion") {
      if (markingMenu.zone === "battle") executeYobinion(markingMenu.owner, markingMenu.card.instanceId, false);
      else setYobinionSourceMode({ owner: markingMenu.owner, dragon: false });
    }
    if (action === "effect_warning") {
      if (onEffectWarningRequest) onEffectWarningRequest({ owner: markingMenu.owner, cardId: markingMenu.card.instanceId });
      else commit((current) => notifyOpponent(current, markingMenu.owner, `${markingMenu.card.name}に「効果無視の疑い」が送られました`));
    }
    setMarkingMenu(null);
  }

  function finishMarkingMenu(x: number, y: number) {
    clearOtherBranchTimer();
    if (pendingDestinationStack) {
      finishDestinationStackMenu(x, y);
      return;
    }
    if (!markingMenu) return;
    if (isMarkingMenuGestureCancelled(markingMenu.x, markingMenu.y, x, y)) {
      setMarkingMenu(null);
      return;
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { center } = getMarkingMenuGeometry(markingMenu, viewportWidth, viewportHeight);
    const selected = selectCurrentMarkingItem(markingMenu, x, y);
    if (!selected) {
      setMarkingMenu(null);
      return;
    }
    if (selected.action === "other" && markingMenu.branch === null) {
      setMarkingMenu(null);
      return;
    }
    if (selected.action === "yobinion" && Math.hypot(x - center.x, y - center.y) >= 170) {
      if (markingMenu.zone === "battle") executeYobinion(markingMenu.owner, markingMenu.card.instanceId, true);
      else setYobinionSourceMode({ owner: markingMenu.owner, dragon: true });
      setMarkingMenu(null);
      return;
    }
    markingMenuAction(selected.action);
  }

  function finishDestinationStackMenu(x: number, y: number) {
    if (!pendingDestinationStack) return;
    if (isMarkingMenuGestureCancelled(pendingDestinationStack.x, pendingDestinationStack.y, x, y)) {
      closeDestinationStack();
      return;
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { center, positions, radius } = getStackDestinationMenuGeometry(pendingDestinationStack, viewportWidth, viewportHeight);
    const selected = selectStackDestinationItem(positions, x - center.x, y - center.y, undefined, radius);
    if (!selected) {
      closeDestinationStack();
      return;
    }
    commitStackDestinationAction(selected.action);
  }

  function moveMarkingMenuPointer(x: number, y: number) {
    queuedMarkingPointer.current = { x, y };
    if (markingPointerFrame.current !== null) return;
    markingPointerFrame.current = window.requestAnimationFrame(() => {
      markingPointerFrame.current = null;
      const point = queuedMarkingPointer.current;
      queuedMarkingPointer.current = null;
      if (!point) return;
      setMarkingMenu((current) => {
        if (!current) {
          clearOtherBranchTimer();
          return null;
        }
        const next = { ...current, pointerX: point.x, pointerY: point.y };
        const selected = current.branch === null ? selectCurrentMarkingItem(current, point.x, point.y) : null;
        if (selected?.action === "other") {
          if (otherBranchTimer.current === null) {
            setOtherBranchProgress({ x: point.x, y: point.y });
            otherBranchTimer.current = window.setTimeout(() => {
              otherBranchTimer.current = null;
              setOtherBranchProgress(null);
              setMarkingMenu((latest) => latest?.branch === null ? { ...latest, branch: "other" } : latest);
            }, OTHER_BRANCH_HOLD_MS);
          }
        } else clearOtherBranchTimer();
        return next;
      });
      setPendingDestinationStack((current) => current ? { ...current, pointerX: point.x, pointerY: point.y } : null);
    });
  }

  function openMarkingMenu(owner: PlayerId, zone: PlayZone, card: CardInstance, x: number, y: number, deckCard = false) {
    clearOtherBranchTimer();
    if (pendingMoveSelection && pendingMoveSelection.owner === owner && card.instanceId !== pendingMoveSelection.cardId) {
      const permitted = getMoveRule(pendingMoveSelection.from, zone) !== "prohibited"
        || (pendingMoveSelection.from === "battle" && zone === "battle");
      if (permitted) {
        setPendingDestinationStack({ ...pendingMoveSelection, pointerX: x, pointerY: y, targetCardId: card.instanceId, targetZone: zone, x, y });
        return;
      }
    }
    const items = getContextualActions({ face: card.face, deckCard, isMultiSelectMode: selectionMode && selectedCards.size > 0, isStack: Boolean(card.stackId), playerSide: !readOnly && owner === controlledPlayer ? "self" : "opponent", selectedCount: selectedCards.size, tapped: card.tapped, zone });
    setMarkingMenu({ branch: null, card, items, owner, pointerX: x, pointerY: y, x, y, zone });
  }

  function draw(owner: PlayerId) {
    if (localPlayer && owner !== localPlayer) return;
    commit((current) => runDrawProductionShadow(current, owner).board);
  }

  function shuffleDeck(owner: PlayerId) {
    if (localPlayer && owner !== localPlayer) return;
    if (board.players[owner].deck.length < 2) return;
    if (onShuffleRequest) onShuffleRequest({ owner, zone: "deck", mode: "deck" });
    else commit((current) => ({ ...current, players: { ...current.players, [owner]: { ...current.players[owner], deck: shuffleCards(current.players[owner].deck) } } }));
    animateShuffleFeedback(() => document.querySelectorAll<HTMLElement>(`.deck-pile[data-drop-owner="${owner}"][data-drop-zone="deck"]`));
  }

  function handleCircle(owner: PlayerId, zone: PlayZone) {
    if (zone === "deck") shuffleDeck(owner);
    else if (selectedCards.size > 1) {
      const shuffledIds = [...selectedCards];
      if (onShuffleRequest) onShuffleRequest({ owner, zone, mode: "selection", cardIds: shuffledIds });
      else commit((current) => shuffleSelectedCards(current, selectedCards));
      animateShuffleFeedback(() => cardShuffleFeedbackTargets(shuffledIds));
    }
  }

  function undo() {
    if (onExternalUndo) {
      onExternalUndo();
      return;
    }
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((items) => [board, ...items].slice(0, 50));
    setPast((items) => items.slice(0, -1));
    setBoard(previous);
    onStateChange?.(previous);
  }

  function redo() {
    if (onExternalRedo) {
      onExternalRedo();
      return;
    }
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items.slice(-49), board]);
    setFuture((items) => items.slice(1));
    setBoard(next);
    onStateChange?.(next);
  }

  function reset() {
    commit((current) => resetBoard(current));
  }

  function switchPerspective(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPerspective((current) => current === "p1" ? "p2" : "p1");
  }

  function untapZone(owner: PlayerId, zone: PlayZone) {
    if ((zone !== "mana" && zone !== "battle") || (localPlayer && owner !== localPlayer)) return;
    commit((current) => untapZoneCards(current, owner, zone));
  }

  function selectMoveDestination(owner: PlayerId, zone: PlayZone, targetCard?: CardInstance) {
    const pending = pendingMoveSelection;
    if (!pending || pending.owner !== owner || getMoveRule(pending.from, zone) === "prohibited") return false;
    moveCard(pending.owner, pending.from, pending.cardId, zone);
    setPendingMoveSelection(null);
    setInteractionNotice(null);
    return true;
  }

  function selectAuxiliaryZone(owner: PlayerId, zone: PlayZone) {
    const opening = activeAuxiliaryZones[owner] !== zone;
    setActiveAuxiliaryZones((current) => ({ ...current, [owner]: current[owner] === zone ? null : zone }));
    if (opening && owner === displayPlayers[1]) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.scrollTo({ behavior: "smooth", top: document.documentElement.scrollHeight });
      }));
    }
  }

  function openOptions(owner: PlayerId, zone: PlayZone, card: CardInstance) {
    if (localPlayer && owner !== localPlayer && (zone === "hand" || zone === "deck")) {
      setPrivateZoneConfirm({ owner, zone, card });
      return;
    }
    setMenu({ owner, zone, card });
  }

  function requestTurnEnd() {
    if (readOnly || !localPlayer || board.activePlayer !== localPlayer || board.turnRequest) return;
    commit((current) => current.activePlayer !== localPlayer || current.turnRequest ? current : ({
      ...current,
      players: {
        ...current.players,
        [current.activePlayer]: {
          ...current.players[current.activePlayer],
          battle: current.players[current.activePlayer].battle.map((card) => ({ ...card, markers: card.markers?.filter((marker) => marker !== "summoning_sickness") })),
        },
      },
      turnRequest: { requestedBy: current.activePlayer, status: "pending" },
    }));
  }

  function respondTurnEnd(accept: boolean) {
    if (readOnly || !localPlayer || !board.turnRequest || board.turnRequest.requestedBy === localPlayer || (board.turnRequest.status === "held" && !accept)) return;
    commit((current) => {
      if (!current.turnRequest || current.turnRequest.requestedBy === localPlayer || current.activePlayer !== current.turnRequest.requestedBy) return current;
      if (current.turnRequest.status === "held" && !accept) return current;
      if (!accept) return { ...current, turnRequest: current.turnRequest ? { ...current.turnRequest, status: "held" } : null };
      const advanced = advanceTurn(current);
      return {
        ...advanced,
        notifications: [...(current.notifications ?? []), {
          id: `${Date.now()}`,
          recipient: advanced.activePlayer,
          message: `${advanced.activePlayer === "p1" ? "先攻" : "後攻"}${advanced.turn}ターン目を開始しました`,
          createdAt: Date.now(),
        }],
      };
    });
  }

  const localNotifications = (board.notifications ?? []).filter((notice) => notice.recipient === controlledPlayer && !dismissedNotificationIds.has(notice.id));
  const revealNotificationIds = localNotifications.filter((notice) => notice.message === "相手が仮置き場のカードを公開しました").map((notice) => notice.id).join("|");
  useEffect(() => {
    const ids = revealNotificationIds ? revealNotificationIds.split("|") : [];
    if (ids.length === 0) return;
    const timer = window.setTimeout(() => setDismissedNotificationIds((current) => new Set([...current, ...ids])), 5000);
    return () => window.clearTimeout(timer);
  }, [revealNotificationIds]);
  function dismissInteractionNotifications() {
    setInteractionNotice(null);
    setDismissedNotificationIds((current) => {
      const next = new Set(current);
      for (const notice of board.notifications ?? []) if (notice.recipient === controlledPlayer) next.add(notice.id);
      return next;
    });
    onNonScrollInteraction?.();
  }
  const markerCard = markerTarget ? board.players[markerTarget.owner][markerTarget.zone].find((card) => card.instanceId === markerTarget.cardId) : null;
  const detailCard = detail ? Object.values(board.players).flatMap((player) => Object.values(player).flat()).find((card) => card.instanceId === detail.instanceId) ?? detail : null;
  const detailMarkers = detailCard?.markers ?? [];
  const orderedDetailMarkers: CardMarker[] = [...visibleMarkerGroups.flat().map(([marker]) => marker), "shield_force"];

  if (!externalState && (cards.reduce((sum, card) => sum + card.quantity, 0) < 10 || (opponentCards?.reduce((sum, card) => sum + card.quantity, 0) ?? 10) < 10)) {
    return <div className="history-empty"><strong>カードが足りません</strong><p>初期手札とシールドを作るため、10枚以上でひとり回しを開始してください。</p></div>;
  }

  return (
    <div className={`playtest-board rough-battle-board ${opponentCollapsed ? "opponent-collapsed" : ""} ${opponentButtonsCollapsed ? "opponent-buttons-collapsed" : ""} ${!opponentCollapsed && activeAuxiliaryZones[displayPlayers[0]] === "hand" ? "opponent-hand-open" : ""} ${yobinionSourceMode ? "source-selection-mode" : ""}`} onClick={(event) => { if (selectionMode && !(event.target as HTMLElement).closest(".play-card,button,.marking-menu,.play-modal")) exitMultiSelect(); }} onContextMenu={(event) => event.preventDefault()} onPointerCancelCapture={() => { if (interactionCardId.current) onCardInteractionChange?.({ active: false, cardId: interactionCardId.current }); interactionCardId.current = null; interactionScrolled.current = false; }} onPointerDownCapture={(event) => { interactionScrolled.current = false; const cardId = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id]")?.dataset.cardId; if (!cardId) return; interactionCardId.current = cardId; onCardInteractionChange?.({ active: true, cardId }); }} onPointerUpCapture={(event) => { if (interactionCardId.current) onCardInteractionChange?.({ active: false, cardId: interactionCardId.current }); interactionCardId.current = null; if (!interactionScrolled.current && !(event.target as HTMLElement).closest(".play-notification,.opponent-operation-notice")) dismissInteractionNotifications(); interactionScrolled.current = false; }} onScrollCapture={() => { interactionScrolled.current = true; }}>
      <PageScrollRail />
      <RemoteCardInteractionIndicator interaction={remoteCardInteraction} />
      {targetSource ? <TargetArrows sourceId={targetSource.cardId} targetIds={[...selectedCards]} /> : null}
      {interactionNotice ? <button className="opponent-operation-notice" onClick={() => setInteractionNotice(null)} type="button">⚠ {interactionNotice}</button> : null}
      {localNotifications.map((notice) => <button className="play-notification" key={notice.id} onClick={() => {
        if (notice.revealedCard) setDetail(notice.revealedCard);
        commit((current) => ({ ...current, notifications: (current.notifications ?? []).filter((item) => item.id !== notice.id) }));
      }} type="button">{notice.message}</button>)}
      {selectionMode || targetSource || yobinionSourceMode || pendingMoveSelection ? <div className="play-mode-toolbar"><strong>{pendingMoveSelection ? "移動先のゾーンをタップ" : selectionMode ? `複数選択：${selectedCards.size}枚` : targetSource ? `対象指定：${selectedCards.size}枚` : yobinionSourceMode?.dragon ? "ドラゴンヨビニオン：発動元を選択" : "ヨビニオン：発動元を選択"}</strong><button onClick={() => { setSelectionMode(false); setTargetSource(null); setYobinionSourceMode(null); setPendingMoveSelection(null); setPendingZoneCardChoice(null); setInteractionNotice(null); setSelectedCards(new Set()); }} type="button">完了／キャンセル</button></div> : null}
      <div className="battle-history-actions"><div className="battle-primary-actions"><button onClick={() => setSettingsOpen(true)} type="button">設定</button><button onClick={onResetRequest ?? reset} type="button">{resetLabel ?? "リセット"}</button></div></div>
      <div className="battle-fields">
        <BattlePlayer selectedCards={selectedCards} openedStack={openedStack} onCloseStack={() => setOpenedStack(null)} onUnbundleStack={(owner, zone, stackId) => { commit((current) => unbundleStack(current, owner, zone, stackId)); setOpenedStack(null); }} activeAuxiliaryZone={activeAuxiliaryZones[displayPlayers[0]]} board={board} buttonsCollapsed={opponentButtonsCollapsed} collapsed={opponentCollapsed} controlledPlayer={controlledPlayer} canViewDeck={!readOnly && displayPlayers[0] === visibilityPlayer} deckName={deckNames[displayPlayers[0]]} format={deckFormats[displayPlayers[0]]} owner={displayPlayers[0]} position="top" view={visibilityPlayer} revealHiddenCards={revealHiddenCards} privateReveal={onlineReveal} onToggleReveal={onlineReveal && !readOnly ? toggleReveal : undefined} onBackgroundTap={exitMultiSelect} onButtonsCollapse={() => setOpponentButtonsCollapsed((value) => !value)} onCircle={handleCircle} onCollapse={() => setOpponentCollapsed((value) => !value)} onDetails={setDetail} onDoubleTap={handleCardDoubleTap} onDraw={draw} onMove={moveCard} onMarkingMenuStart={openMarkingMenu} onMarkingMenuMove={moveMarkingMenuPointer} onMarkingMenuEnd={finishMarkingMenu} onOpenExternalZones={setExternalZonePickerOwner} onOptions={openOptions} onSelectAuxiliaryZone={selectAuxiliaryZone} onTap={handleCardTap} onUntapZone={untapZone} onZoneSelect={selectMoveDestination} />
        <div className="perspective-divider"><div className="divider-turn-actions">{localPlayer && board.turnRequest?.requestedBy === controlledPlayer ? <span>{board.turnRequest.status === "held" ? "保留中" : "応答待ち"}</span> : null}</div><button aria-label={localPlayer ? board.turnRequest?.status === "held" && board.turnRequest.requestedBy !== localPlayer ? "ターンエンドを受け入れる" : "ターンエンド" : "プレイヤーの表示位置を交代"} className="perspective-switch" disabled={Boolean(localPlayer && (readOnly || (board.turnRequest?.status === "held" && board.turnRequest.requestedBy !== localPlayer ? false : board.activePlayer !== localPlayer || Boolean(board.turnRequest))))} onClick={localPlayer ? board.turnRequest?.status === "held" && board.turnRequest.requestedBy !== localPlayer ? () => respondTurnEnd(true) : requestTurnEnd : switchPerspective} onPointerDown={(event) => event.stopPropagation()} type="button"><span aria-hidden="true" className="perspective-switch-icon">{localPlayer ? "⟳" : "↕"}</span><span className="perspective-switch-copy"><span className="perspective-switch-label">{localPlayer ? board.turnRequest?.status === "held" && board.turnRequest.requestedBy !== localPlayer ? "ターンエンドを受け入れる" : "ターンエンド" : "交代"}</span><span className="perspective-switch-subtitle">{localPlayer ? "TURN END" : "TURN CHANGE"}</span></span></button></div>
        <BattlePlayer selectedCards={selectedCards} openedStack={openedStack} onCloseStack={() => setOpenedStack(null)} onUnbundleStack={(owner, zone, stackId) => { commit((current) => unbundleStack(current, owner, zone, stackId)); setOpenedStack(null); }} activeAuxiliaryZone={activeAuxiliaryZones[displayPlayers[1]]} board={board} collapsed={false} controlledPlayer={controlledPlayer} canViewDeck={!readOnly && displayPlayers[1] === visibilityPlayer} deckName={deckNames[displayPlayers[1]]} format={deckFormats[displayPlayers[1]]} owner={displayPlayers[1]} position="bottom" view={visibilityPlayer} revealHiddenCards={revealHiddenCards} privateReveal={onlineReveal} onToggleReveal={onlineReveal && !readOnly ? toggleReveal : undefined} onBackgroundTap={exitMultiSelect} onCircle={handleCircle} onCollapse={() => undefined} onDetails={setDetail} onDoubleTap={handleCardDoubleTap} onDraw={draw} onMove={moveCard} onMarkingMenuStart={openMarkingMenu} onMarkingMenuMove={moveMarkingMenuPointer} onMarkingMenuEnd={finishMarkingMenu} onOpenExternalZones={setExternalZonePickerOwner} onOptions={openOptions} onSelectAuxiliaryZone={selectAuxiliaryZone} onTap={handleCardTap} onUntapZone={untapZone} onZoneSelect={selectMoveDestination} />
      </div>
      <div className="hand-history-actions"><button disabled={externalHistoryBusy || (usesExternalHistory ? !canExternalUndo : past.length === 0)} onClick={undo} type="button">↶戻す</button><button disabled={externalHistoryBusy || (usesExternalHistory ? !canExternalRedo : future.length === 0)} onClick={redo} type="button">↷進む</button></div>
      {dynamicBottomClearance > 0 ? <div aria-hidden="true" className="playtest-bottom-clearance" style={{ height: dynamicBottomClearance }} /> : null}

      {localPlayer && board.turnRequest?.requestedBy !== controlledPlayer && board.turnRequest?.status === "pending" ? <div className="turn-end-modal-backdrop"><section aria-describedby="turn-end-description" aria-labelledby="turn-end-title" aria-modal="true" className="turn-end-modal" onKeyDown={(event) => { if (event.key !== "Tab") return; const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button"); if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); } }} role="dialog"><span aria-hidden="true" className="turn-end-modal-icon">⟳</span><h2 id="turn-end-title">ターンエンド処理を行いますか？</h2><p id="turn-end-description">相手に処理を渡すか、保留して続行するかを選択してください。</p><div className="turn-end-modal-actions"><button autoFocus className="turn-end-hold" onClick={() => respondTurnEnd(false)} type="button">保留</button><button className="turn-end-accept" onClick={() => respondTurnEnd(true)} type="button">受け入れる</button></div></section></div> : null}

      {detailCard ? <div className="play-modal-backdrop" role="presentation" onClick={() => setDetail(null)}><section aria-modal="true" className="play-modal card-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog"><p className="eyebrow">カード詳細</p><h2>{detailCard.name}</h2><CardVisualStage className="card-detail-viewport"><CardArtwork imageUrl={detailCard.imageUrl} name={detailCard.name} sizes="(max-width:700px) 90vw, 384px" /></CardVisualStage>{detailMarkers.length > 0 ? <div aria-label="適用中のマーカー" className="detail-marker-list" role="list">{orderedDetailMarkers.filter((marker) => detailMarkers.includes(marker)).map((marker) => { const label = markerLabels[marker] ?? (marker === "shield_force" ? "シールドフォース" : "召喚酔い"); const count = detailMarkers.filter((item) => item === marker).length; return <div className="detail-marker" key={marker} role="listitem"><img alt="" height={28} src={marker === "shield_force" ? "/markers/shield-force.svg" : `/markers/preview/${markerAssetNames[marker]}.svg`} width={28} /><span>{label}{count > 1 ? ` ×${count}` : ""}</span></div>; })}</div> : null}<button className="button" onClick={() => setDetail(null)} type="button">閉じる</button></section></div> : null}
      {menu ? <div className="play-modal-backdrop" role="presentation" onClick={() => setMenu(null)}><section aria-modal="true" className="play-modal" onClick={(event) => event.stopPropagation()} role="dialog"><p className="eyebrow">操作</p><h2>{menu.zone === "deck" ? "山札" : menu.card.name}</h2>{menu.zone === "deck" ? <div className="play-option-grid"><button onClick={() => { draw(menu.owner); setMenu(null); }} type="button">ドロー</button><button onClick={() => { shuffleDeck(menu.owner); setMenu(null); }} type="button">シャッフル</button><button disabled type="button">ヨビニオン（準備中）</button><button disabled type="button">メクレイド（準備中）</button></div> : <div className="play-option-grid">{visibleZones.filter((zone) => getMoveRule(menu.zone, zone) !== "prohibited").map((zone) => <button key={zone} onClick={() => moveCard(menu.owner, menu.zone, menu.card.instanceId, zone)} type="button">{zoneLabels[zone]}へ</button>)}</div>}<button className="secondary-button" onClick={() => setMenu(null)} type="button">キャンセル</button></section></div> : null}
      {markingMenu ? <MarkingMenu menu={markingMenu} onAction={markingMenuAction} onClose={() => { clearOtherBranchTimer(); setMarkingMenu(null); }} onMove={(zone) => { moveCard(markingMenu.owner, markingMenu.zone, markingMenu.card.instanceId, zone); setMarkingMenu(null); }} /> : null}
      <LongPressProgress durationMs={OTHER_BRANCH_HOLD_MS} label="その他の操作パネルを開くまでの残り時間" point={otherBranchProgress} />
      {settingsOpen ? <div className="play-modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><section aria-modal="true" className="play-modal play-settings-modal" onClick={(event) => event.stopPropagation()} role="dialog"><h2>操作設定</h2><label>長押し反応時間 <strong>{longPressMs}ms</strong><input max={LONG_PRESS_MAX_MS} min={LONG_PRESS_MIN_MS} onChange={(event) => setLongPressMs(saveLongPressMs(Number(event.target.value)))} step={20} type="range" value={longPressMs} /></label><button className="button" onClick={() => setSettingsOpen(false)} type="button">閉じる</button></section></div> : null}
      {externalZonePickerOwner ? <div className="play-modal-backdrop" role="presentation" onClick={() => setExternalZonePickerOwner(null)}><section aria-modal="true" className="play-modal external-zone-picker" onClick={(event) => event.stopPropagation()} role="dialog"><h2>外部エリアを選択</h2><div className="play-option-grid">{externalZones.map((zone) => <button key={zone} onClick={() => { selectAuxiliaryZone(externalZonePickerOwner, zone); setExternalZonePickerOwner(null); }} type="button"><strong>{zoneLabels[zone]}</strong><span>{countZoneCards(board.players[externalZonePickerOwner][zone])}枚</span></button>)}</div><button className="secondary-button" onClick={() => setExternalZonePickerOwner(null)} type="button">キャンセル</button></section></div> : null}
      {pendingDeckMove ? <div className="deck-direct-choice" style={{ left: pendingDeckMove.x, top: pendingDeckMove.y }}><button className="top" onClick={() => { commitMove(pendingDeckMove.owner, pendingDeckMove.from, pendingDeckMove.cardId, "deck", "top", pendingDeckMove.individual); setPendingDeckMove(null); setPendingMoveSelection(null); }} type="button">山札の上</button><button className="bottom" onClick={() => { commitMove(pendingDeckMove.owner, pendingDeckMove.from, pendingDeckMove.cardId, "deck", "bottom", pendingDeckMove.individual); setPendingDeckMove(null); setPendingMoveSelection(null); }} style={{ top: pendingDeckMove.height }} type="button">山札の下</button></div> : null}
      {pendingDestinationStack ? <StackDestinationMarkingMenu menu={pendingDestinationStack} /> : null}
      {markerTarget ? <div className="play-modal-backdrop marker-control-backdrop" role="presentation" onClick={() => setMarkerTarget(null)}>
        <section aria-label="マーキング" aria-modal="true" className="play-modal marker-control-modal" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { markerPointerDown.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => {
          const start = markerPointerDown.current;
          markerPointerDown.current = null;
          if ((event.target as HTMLElement).closest("button") || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { markerTap.current = null; return; }
          const now = performance.now();
          const last = markerTap.current;
          markerTap.current = { x: event.clientX, y: event.clientY, time: now };
          if (last && now - last.time <= 350 && Math.hypot(event.clientX - last.x, event.clientY - last.y) <= 28) { markerTap.current = null; clearMarkers(markerTarget); }
        }} role="dialog">
          <header className="marker-modal-header"><h2>マーキング</h2><button aria-label="マーキングを閉じる" className="marker-modal-close" onClick={() => setMarkerTarget(null)} type="button">×</button></header>
          <div className="marker-card-summary">{markerCard ? <><div className="marker-card-art"><CardArtwork imageUrl={markerCard.imageUrl} name={markerCard.name} sizes="96px" /></div><strong>{markerCard.name}</strong></> : null}</div>
          <div className="marker-control-columns">{visibleMarkerGroups.map((group, groupIndex) => <div className="marker-control-grid" key={groupIndex}>
            <h3 className={groupIndex === 0 ? "marker-buff-heading" : "marker-debuff-heading"}>{groupIndex === 0 ? "バフ" : "デバフ"}</h3>
            {group.map(([marker, label]) => {
              const active = markerCard?.markers?.includes(marker) ?? false;
              return <div className="marker-control" key={marker}>
                <img alt="" className="marker-control-icon" height={48} src={`/markers/preview/${markerAssetNames[marker]}.svg`} width={48} />
                <span className="marker-effect-label">{label}</span>
                <button aria-checked={active} aria-label={`${label}を${active ? "オフ" : "オン"}にする`} className={`marker-switch${active ? " active" : ""}`} onClick={() => updateMarker(markerTarget, marker, !active)} role="switch" type="button"><span /></button>
              </div>;
            })}
          </div>)}</div>
          <button className="marker-modal-done" onClick={() => setMarkerTarget(null)} type="button">閉じる</button>
        </section>
      </div> : null}
      {deckViewConfirm ? <div className="play-modal-backdrop" role="presentation" onClick={() => setDeckViewConfirm(null)}><section aria-modal="true" className="play-modal" onClick={(event) => event.stopPropagation()} role="dialog"><h2>本当に行いますか？</h2><p>非公開ゾーンである山札の内容を閲覧します。</p><button className="button" onClick={() => { if (!readOnly && deckViewConfirm === visibilityPlayer) selectAuxiliaryZone(deckViewConfirm, "deck"); setDeckViewConfirm(null); }} type="button">YES</button><button className="secondary-button" onClick={() => setDeckViewConfirm(null)} type="button">NO</button></section></div> : null}
      {privateZoneConfirm ? <div className="play-modal-backdrop" role="presentation" onClick={() => setPrivateZoneConfirm(null)}><section aria-modal="true" className="play-modal" onClick={(event) => event.stopPropagation()} role="dialog"><h2>本当に見ますか？</h2><p>相手の非公開ゾーンを閲覧すると相手へ通知されます。</p><button className="button" onClick={() => { const pending = privateZoneConfirm; if (onInspectionRequest) onInspectionRequest({ owner: pending.owner, cardId: pending.card.instanceId }); else commit((current) => { const recipient: PlayerId = controlledPlayer === "p1" ? "p2" : "p1"; return { ...current, inspection: { cardId: pending.card.instanceId, owner: pending.owner, viewer: controlledPlayer }, notifications: [...(current.notifications ?? []), { id: `${Date.now()}-inspection-${recipient}`, recipient, message: `相手があなたの${zoneLabels[pending.zone]}を確認しました`, createdAt: Date.now() }] }; }); setPrivateZoneConfirm(null); }} type="button">見る</button><button className="secondary-button" onClick={() => setPrivateZoneConfirm(null)} type="button">キャンセル</button></section></div> : null}
      {inspectionConfirm ? <div className="play-modal-backdrop" role="presentation" onClick={() => setInspectionConfirm(null)}><section aria-modal="true" className="play-modal" onClick={(event) => event.stopPropagation()} role="dialog"><h2>本当に行いますか？</h2><p>非公開カードを確認すると相手へ通知されます。</p><button className="button" onClick={() => { const pending = inspectionConfirm; if (onInspectionRequest) onInspectionRequest(pending); else commit((current) => { const recipient: PlayerId = controlledPlayer === "p1" ? "p2" : "p1"; return { ...current, inspection: { ...pending, viewer: controlledPlayer }, notifications: [...(current.notifications ?? []), { id: `${Date.now()}-inspection-${recipient}`, recipient, message: "相手が非公開カードを確認しました", createdAt: Date.now() }] }; }); setInspectionConfirm(null); }} type="button">YES</button><button className="secondary-button" onClick={() => setInspectionConfirm(null)} type="button">NO</button></section></div> : null}
    </div>
  );
}


