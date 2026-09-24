import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyPointerGesture,
  getMoveRule,
  isWithinHorizontalScrollAngle,
  moveDefaults,
  resolveCenteredHandCardId,
  resolveDeckDropArea,
  resolveDeckDropTargetActive,
  resolveDropTarget,
  resolveDeckDragRelease,
  resolvePointerReleaseGesture,
  shouldUseZoneScroll,
  stackHoldPhase,
  STACK_HOLD_MENU_MS,
  STACK_HOLD_PROGRESS_MS,
  validateManaPayment,
} from "./playfield-interactions.ts";
import { beginDeckInspectionSession } from "./deck-inspection-session.ts";

test("ドラッグを長押しやタップより優先する", () => {
  assert.equal(classifyPointerGesture({ durationMs: 700, distancePx: 9 }), "drag");
  assert.equal(classifyPointerGesture({ durationMs: 500, distancePx: 0 }), "long_press");
  assert.equal(classifyPointerGesture({ durationMs: 180, distancePx: 2 }), "tap");
  assert.equal(classifyPointerGesture({ durationMs: 300, distancePx: 2 }), "none");
});

test("一度ドラッグが成立したら開始座標の更新後もドラッグとして完了する", () => {
  assert.equal(resolvePointerReleaseGesture({
    distancePx: 2,
    dragActivated: true,
    durationMs: 800,
  }), "drag");
  assert.equal(resolvePointerReleaseGesture({
    distancePx: 2,
    dragActivated: false,
    durationMs: 800,
  }), "long_press");
});

test("一度確定したスクロール／ドラッグ判定をジェスチャー終了まで維持する", () => {
  const scrollStarted = shouldUseZoneScroll({ dragActivated: false, horizontalWithinScrollAngle: true, isScrolling: false });
  assert.equal(scrollStarted, true);
  assert.equal(shouldUseZoneScroll({ dragActivated: false, horizontalWithinScrollAngle: false, isScrolling: scrollStarted }), true);

  const dragStarted = true;
  assert.equal(shouldUseZoneScroll({ dragActivated: dragStarted, horizontalWithinScrollAngle: false, isScrolling: false }), false);
  assert.equal(shouldUseZoneScroll({ dragActivated: dragStarted, horizontalWithinScrollAngle: true, isScrolling: false }), false);
});

test("最初の9px縦移動はスクロール条件に入らずドラッグとして分類する", () => {
  const horizontalWithinScrollAngle = isWithinHorizontalScrollAngle(0, 9);
  assert.equal(horizontalWithinScrollAngle, false);
  assert.equal(shouldUseZoneScroll({ dragActivated: false, horizontalWithinScrollAngle, isScrolling: false }), false);
  assert.equal(classifyPointerGesture({ durationMs: 100, distancePx: 9 }), "drag");
});

test("展開した山札も他ゾーンと同じカード上スワイプ判定を使う", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.match(board, /cardSwipeScrollableZones: PlayZone\[\] = \[[^\]]*"deck"[^\]]*\]/);
  assert.match(board, /\(deckViewer \|\| cardSwipeScrollableZones\.includes\(zone\)\) && shouldUseZoneScroll\(/);
  assert.doesNotMatch(board, /shouldSwitchHandScrollToDrag|switchDeckViewerScrollToDrag/);
  const pointerMoveStart = board.indexOf("function pointerMove(event: PointerEvent)");
  const pointerMoveEnd = board.indexOf("function pointerUp(event: PointerEvent)", pointerMoveStart);
  const pointerMove = board.slice(pointerMoveStart, pointerMoveEnd);
  assert.doesNotMatch(pointerMove, /zoneScrollGesture\.current = false/);
  assert.doesNotMatch(pointerMove, /start\.current = \{ \.\.\.start\.current/);
});

test("山札閲覧の表示は専用UI stateで切り替え、補助ゾーンstateへ依存しない", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.match(board, /function DeckPile\(\{ active,/);
  assert.match(board, /setDeckViewerOpen\(true\)/);
  assert.match(board, /<DeckPile active=\{false\}/);
  assert.equal(board.includes('setActiveAuxiliaryZones((current) => ({ ...current, [pending.owner]: "deck"'), false);
});

test("MAXを含む新しい山札閲覧は山札順から始まり、コスト表示は明示切替だけで使う", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.match(board, /const nextInspection: DeckInspection = \{ count: pending\.useMax \? "max" : count, mode: "deck"/);
  assert.match(board, /setDeckInspection\(beginDeckInspectionSession\(nextInspection\)\)/);
  assert.match(board, /cards=\{board\.players\[deckInspection\.owner\]\.deckInspection\}/);
  assert.match(board, /onToggleMode=\{\(mode\) => setDeckInspection\(\(current\) => current \? \{ \.\.\.current, mode \} : current\)\}/);
  const closeStart = board.indexOf("function closeDeckViewer() {");
  const closeEnd = board.indexOf("\n  function shuffleDeckViewerSelection()", closeStart);
  const close = board.slice(closeStart, closeEnd);
  assert.match(close, /else if \(inspection\)\s*\{\s*commit\(\(current\) => moveCardsBetweenZones\(current, inspection\.owner, "deckInspection", "deck"/);
  assert.match(close, /setDeckInspection\(null\)/);
});

test("上から数枚、下から数枚、MAXは前セッションがcostでもdeck modeで始まる", () => {
  const cases = [
    { count: 3, takeFrom: "top" },
    { count: 3, takeFrom: "bottom" },
    { count: "max", takeFrom: "top" },
  ];

  for (const input of cases) {
    const fresh = beginDeckInspectionSession({ ...input, cards: [], owner: "p1" });
    assert.equal(fresh.mode, "deck");

    const previousCost = { ...fresh, mode: "cost" };
    const closed = beginDeckInspectionSession(previousCost);
    const reopened = beginDeckInspectionSession(closed);
    assert.equal(reopened.mode, "deck");
  }
});

test("山札閲覧のスクロールはカード単位のsnapを持たず、共通のscrollと慣性経路を使う", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const deckScrollStyle = css.match(/\.deck-view-cards\{[^}]*\}/)?.[0] ?? "";
  assert.match(deckScrollStyle, /scroll-snap-type:none/);
  assert.doesNotMatch(css.match(/\.deck-view-cards\.deck-order>\.play-card,[^}]*\}/)?.[0] ?? "", /scroll-snap-align/);
  assert.match(board, /updateZoneScroll\(zoneScrollContainer\.current, zoneScrollStartLeft\.current, start\.current/);
  assert.match(board, /updateZoneScroll\(event\.currentTarget, start\.scrollLeft, start/);
  assert.match(board, /startZoneInertia\(event\.currentTarget, emptyScrollVelocity\.current\)/);
});

test("山札閲覧カードの挿入markerは閲覧ゾーン内の並び替え先だけに表示する", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.match(board, /element\.dataset\.cardId !== interactionCardId\.current && viewer\.contains\(element\)/);
  assert.match(board, /if \(viewer && !isDeckPlacementPoint\(owner, event\.clientX, event\.clientY\)\) \{[\s\S]*viewer\.contains\(element\)[\s\S]*targetCard\?\.classList\.add\("deck-insert-before"\)/);
  assert.match(board, /function moveDeckViewerCard\([\s\S]*moveCardsBetweenZones\(current, owner, "deckInspection", to, new Set\(ids\)/);
  assert.match(board, /function returnDeckViewerSelection\([\s\S]*moveCardsBetweenZones\(current, deckInspection\.owner, "deckInspection", "deck", selected, placement/);
});

test("山札閲覧中の短いタップは既存の補助ゾーントグルで閉じ、ドローしない", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.match(board, /gesture === "tap" && !onZoneSelect\?\.\(owner, "deck"\)[\s\S]*if \(active\) onSelectAuxiliaryZone\(owner, "deck"\);\s*else onDraw\(owner\)/);
  assert.match(board, /<DeckPile active=\{false\}/);
  assert.match(board, /function closeDeckViewer\(\)[\s\S]*setDeckViewerOpen\(false\)[\s\S]*setDeckInspection\(null\)/);
});

test("手札スワイプは独自慣性を起動せず、表示中のカード中心へ snap する", () => {
  const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.match(board, /function snapHandToNearestCard\(container: HTMLElement\)/);
  assert.match(board, /if \(inertiaContainer && zone === "hand"\) \{[\s\S]*snapHandToNearestCard\(inertiaContainer\)/);
});

test("全ゾーンのスクロール開始を水平方向から±20度まで許容する", () => {
  const vectorAt = (degrees) => ({ x: 100, y: Math.tan(degrees * Math.PI / 180) * 100 });
  const inside = vectorAt(20);
  const outside = vectorAt(20.1);
  assert.equal(isWithinHorizontalScrollAngle(inside.x, inside.y), true);
  assert.equal(isWithinHorizontalScrollAngle(inside.x, -inside.y), true);
  assert.equal(isWithinHorizontalScrollAngle(outside.x, outside.y), false);
  assert.equal(isWithinHorizontalScrollAngle(outside.x, -outside.y), false);
});

test("重ね先カード上の保持は250msから進捗表示し500msでパネルを開く", () => {
  assert.equal(STACK_HOLD_PROGRESS_MS, 250);
  assert.equal(STACK_HOLD_MENU_MS, 500);
  assert.equal(stackHoldPhase(249), "drag");
  assert.equal(stackHoldPhase(250), "progress");
  assert.equal(stackHoldPhase(499), "progress");
  assert.equal(stackHoldPhase(500), "menu");
});

test("山札移動は上下ボタンで離した時だけ確定し最終到達ゾーンを優先する", () => {
  assert.deepEqual(resolveDeckDragRelease("deck_top", "deck"), { kind: "deck", choice: "deck_top" });
  assert.deepEqual(resolveDeckDragRelease("deck_bottom", null), { kind: "deck", choice: "deck_bottom" });
  assert.deepEqual(resolveDeckDragRelease(null, "mana"), { kind: "zone", zone: "mana" });
  assert.equal(resolveDeckDragRelease(null, "deck"), null);
  assert.equal(resolveDeckDragRelease(null, null), null);
});

test("山札ドロップの上・本体・下は座標から排他的に判定する", () => {
  const deckRect = { left: 100, right: 160, top: 200, bottom: 280 };
  const options = { deckRect, horizontalPadding: 24, verticalHitHeight: 72 };
  assert.equal(resolveDeckDropArea({ ...options, pointX: 130, pointY: 128 }), "top");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 130, pointY: 199 }), "top");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 100, pointY: 200 }), "deck");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 130, pointY: 240 }), "deck");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 160, pointY: 280 }), "deck");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 130, pointY: 281 }), "bottom");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 130, pointY: 352 }), "bottom");
  assert.equal(resolveDeckDropArea({ ...options, pointX: 130, pointY: 353 }), null);
  assert.equal(resolveDeckDropArea({ ...options, pointX: 90, pointY: 240 }), null);
});

test("山札の広域判定は未接触では起動せず、接触後だけ保持して離脱距離で解除する", () => {
  const buttonRect = { left: 110, right: 150, top: 210, bottom: 270 };
  const broadArea = { deckRect: { left: 100, right: 160, top: 200, bottom: 280 }, horizontalPadding: 24, verticalHitHeight: 72 };
  const overWideTop = { pointX: 130, pointY: 150 };
  const wideTopArea = resolveDeckDropArea({ ...broadArea, ...overWideTop });

  assert.equal(wideTopArea, "top");
  assert.equal(resolveDeckDropTargetActive({
    wasActive: false,
    buttonRect,
    deckArea: wideTopArea,
    ...overWideTop,
    exitDistancePx: broadArea.horizontalPadding,
  }), false);

  const overButton = { pointX: 130, pointY: 240 };
  const buttonArea = resolveDeckDropArea({ ...broadArea, ...overButton });
  assert.equal(resolveDeckDropTargetActive({
    wasActive: false,
    buttonRect,
    deckArea: buttonArea,
    ...overButton,
    exitDistancePx: broadArea.horizontalPadding,
  }), true);

  const withinWideBottom = { pointX: 130, pointY: 330 };
  assert.equal(resolveDeckDropTargetActive({
    wasActive: true,
    buttonRect,
    deckArea: resolveDeckDropArea({ ...broadArea, ...withinWideBottom }),
    ...withinWideBottom,
    exitDistancePx: broadArea.horizontalPadding,
  }), true);

  const justOutsideSide = { pointX: 168, pointY: 240 };
  assert.equal(resolveDeckDropTargetActive({
    wasActive: true,
    buttonRect,
    deckArea: resolveDeckDropArea({ ...broadArea, ...justOutsideSide }),
    ...justOutsideSide,
    exitDistancePx: broadArea.horizontalPadding,
  }), true);

  const beyondExitDistance = { pointX: 175, pointY: 240 };
  assert.equal(resolveDeckDropTargetActive({
    wasActive: true,
    buttonRect,
    deckArea: resolveDeckDropArea({ ...broadArea, ...beyondExitDistance }),
    ...beyondExitDistance,
    exitDistancePx: broadArea.horizontalPadding,
  }), false);
});

test("初期手札とドロー後の手札は画面中央に最も近い実在カードを選ぶ", () => {
  const initialHand = [
    { centerX: 80, id: "initial-1" },
    { centerX: 190, id: "initial-2" },
    { centerX: 310, id: "initial-3" },
  ];
  assert.equal(resolveCenteredHandCardId(initialHand, 200, "initial-1"), "initial-2");
  assert.equal(resolveCenteredHandCardId([...initialHand, { centerX: 202, id: "drawn-1" }], 200, "initial-1"), "drawn-1");
  assert.equal(resolveCenteredHandCardId([], 200, "initial-1"), "initial-1");
});

test("初期手札が指の下に重なっても移動先ゾーンだけをドロップ候補にする", () => {
  const hit = resolveDropTarget([
    { cardId: "initial-hand-2", owner: "p1", zone: "hand" },
    { cardId: "battle-card", owner: "p1", zone: "battle" },
    { owner: "p1", zone: "battle" },
  ], "p1", "hand", "initial-hand-2");
  assert.deepEqual(hit, { targetCardId: "battle-card", targetZone: "battle" });
});

test("バトルゾーン内では別カードの上だけを重ねる候補にできる", () => {
  assert.deepEqual(resolveDropTarget([
    { cardId: "battle-card-b", owner: "p1", zone: "battle" },
    { owner: "p1", zone: "battle" },
  ], "p1", "battle", "battle-card-a"), {
    targetCardId: "battle-card-b",
    targetZone: "battle",
  });

  assert.equal(resolveDropTarget([
    { owner: "p1", zone: "battle" },
  ], "p1", "battle", "battle-card-a"), null);

  assert.equal(resolveDropTarget([
    { cardId: "battle-card-a", owner: "p1", zone: "battle" },
  ], "p1", "battle", "battle-card-a"), null);
});

test("束の内容からなら同じバトルゾーンの空き領域もドロップ先にできる", () => {
  assert.deepEqual(resolveDropTarget([{ owner: "p1", zone: "battle" }], "p1", "battle", "stack-card", true), {
    targetCardId: null,
    targetZone: "battle",
  });
});

test("スクロール開始後は縦方向へ動かしてもスクロール判定を維持する", () => {
  const scrollStarted = shouldUseZoneScroll({ dragActivated: false, horizontalWithinScrollAngle: true, isScrolling: false });
  assert.equal(scrollStarted, true);
  assert.equal(shouldUseZoneScroll({ dragActivated: false, horizontalWithinScrollAngle: false, isScrolling: scrollStarted }), true);
});

test("移動表どおり、同じゾーンは禁止・シールドは裏・通常ゾーンは表・山札は特殊扱いにする", () => {
  const zones = ["battle", "shield", "deck", "graveyard", "hyperspatial", "gr", "abyss", "mana", "reveal", "hand"];
  for (const from of zones) {
    for (const to of zones) {
      const expected = from === to
        ? "prohibited"
        : to === "shield"
          ? "face_down"
          : to === "deck"
            ? "special"
            : "face_up";
      assert.equal(getMoveRule(from, to), expected, `${from} -> ${to}`);
    }
  }
  assert.equal(moveDefaults("hand", "deck", { turn: 2, shieldPlacementOrder: 1 }).face, "face_down");
  assert.equal(moveDefaults("deck", "hand", { turn: 2, shieldPlacementOrder: 1 }).face, "owner_only");
  assert.equal(moveDefaults("hand", "mana", { turn: 2, shieldPlacementOrder: 1 }).face, "face_up");
  assert.deepEqual(moveDefaults("hand", "shield", { turn: 2, shieldPlacementOrder: 3 }), {
    face: "face_down",
    shieldMarker: { turn: 2, order: 3 },
  });
  assert.throws(() => moveDefaults("mana", "mana", { turn: 2, shieldPlacementOrder: 1 }));
});

test("マナの数と文明を両方検証する", () => {
  const mana = [
    { id: "1", civilizations: ["fire"], tapped: false },
    { id: "2", civilizations: ["nature"], tapped: false },
    { id: "3", civilizations: ["water"], tapped: false },
  ];
  assert.deepEqual(validateManaPayment(mana, {
    label: "カードA",
    cost: 3,
    civilizations: ["fire", "nature"],
    action: "summon",
  }), { valid: true, missingAmount: 0, missingCivilizations: [] });
  assert.deepEqual(validateManaPayment(mana.slice(0, 2), {
    label: "カードB",
    cost: 3,
    civilizations: ["fire", "darkness"],
    action: "cast",
  }), { valid: false, missingAmount: 1, missingCivilizations: ["darkness"] });
});
