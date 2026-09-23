import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_MARKING_MENU_ITEMS,
  calculateMarkingMenuCenter,
  calculateMarkingMenuPositions,
  calculateMarkingMenuVisualBounds,
  markingMenuAxisTilt,
  isMarkingMenuGestureCancelled,
  OTHER_BRANCH_HOLD_MS,
  selectMarkingMenuItem,
  STACK_DESTINATION_ITEMS,
  calculateStackDestinationPositions,
  calculateStackDestinationVisualBounds,
  selectStackDestinationItem,
} from "./marking-menu.ts";

const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");

test("マーキングのバフ・デバフ順とアイコンを維持する", () => {
  const groups = board.match(/const visibleMarkerGroups = \[\s*([^]*?)\s*\] as const satisfies/)?.[1];
  assert.ok(groups);
  const entries = [...groups.matchAll(/\["([^"]+)", "([^"]+)"\]/g)];
  assert.deepEqual(entries.map((entry) => entry[2]), [
    "メタ注意", "除去耐性", "ジャストダイバー", "選ばれない", "アタックされない", "ブロックされない", "ハイパーモード", "スピードアタッカー", "マッハファイター", "ブロッカー", "スレイヤー", "パワーアップ",
    "アタックできない", "ブロックできない", "アンタップしない", "召喚酔い", "能力無効", "パワーダウン",
  ]);
  assert.equal(new Set(entries.map((entry) => entry[1])).size, 18);
  assert.ok(board.includes('className="marker-control-columns"'));
  assert.ok(!board.includes('className="marker-other-toggle"'));
  for (const name of ["除去耐性", "パワーアップ", "ジャストダイバー", "選ばれない", "アタックされない", "ブロックされない", "パワーダウン"]) {
    assert.ok(existsSync(new URL(`../public/markers/preview/${name}.svg`, import.meta.url)), name);
  }
});

test("ポップアップのボタン以外のダブルタップだけを一括解除候補にする", () => {
  assert.ok(board.includes('onPointerDown={(event) => { markerPointerDown.current'));
  assert.ok(board.includes('closest("button")'));
  assert.ok(board.includes('now - last.time <= 350'));
  assert.ok(board.includes('clearMarkers(markerTarget)'));
});

test("marking menu exposes six customizable numbered slots", () => {
  assert.deepEqual(DEFAULT_MARKING_MENU_ITEMS.map((item) => item.slot), [1, 2, 3, 4, 5, 6]);
  assert.equal(calculateMarkingMenuPositions([...DEFAULT_MARKING_MENU_ITEMS, DEFAULT_MARKING_MENU_ITEMS[0]], 500, 1000).length, 6);
});

test("center and outer zones cancel while the active ring selects by direction", () => {
  const positions = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 500, 1000);
  assert.equal(selectMarkingMenuItem(positions, 0, -30), null);
  assert.equal(selectMarkingMenuItem(positions, 0, -70)?.slot, 2);
  assert.equal(selectMarkingMenuItem(positions, 0, -180)?.slot, 2);
  assert.equal(selectMarkingMenuItem(positions, 0, -480)?.slot, 2);
  assert.equal(selectMarkingMenuItem(positions, 0, -795), null);
  assert.equal(selectMarkingMenuItem(positions, -120, -90)?.slot, 1);
  assert.equal(selectMarkingMenuItem(positions, 120, 90)?.slot, 6);
});

test("an edge-adjusted menu still cancels from the original touch point", () => {
  const positions = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 5, 390, 86);
  const bounds = calculateMarkingMenuVisualBounds(positions, 390);
  const center = calculateMarkingMenuCenter(5, 790, 390, 800, bounds);
  assert.ok(center.x > 5);
  assert.ok(center.y < 790);
  assert.equal(isMarkingMenuGestureCancelled(5, 790, 5, 790), true);
  assert.equal(isMarkingMenuGestureCancelled(5, 790, 5, 700), false);
});

test("center area uses vertical axes and 35 degree spacing", () => {
  const positions = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 500, 1000);
  assert.deepEqual(positions.map((item) => item.angle), [-35, 0, 35, 215, 180, 145]);
  assert.ok(positions[1].y < positions[0].y - 30);
  assert.ok(positions[4].y > positions[3].y + 30);
});

test("card position never changes the menu angles", () => {
  assert.equal(markingMenuAxisTilt(100, 1000), 0);
  assert.equal(markingMenuAxisTilt(500, 1000), 0);
  assert.equal(markingMenuAxisTilt(900, 1000), 0);
  const left = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 100, 1000);
  const right = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 900, 1000);
  assert.deepEqual(left.map((item) => item.angle), right.map((item) => item.angle));
});

test("the complete Maya option bounds stay inside every viewport edge", () => {
  const viewportWidth = 390;
  const viewportHeight = 800;
  const positions = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 0, viewportWidth, 86);
  const bounds = calculateMarkingMenuVisualBounds(positions, viewportWidth);
  for (const [x, y] of [[0, 0], [viewportWidth, 0], [0, viewportHeight], [viewportWidth, viewportHeight]]) {
    const center = calculateMarkingMenuCenter(x, y, viewportWidth, viewportHeight, bounds);
    for (const item of bounds) {
      assert.ok(center.x + item.x - item.halfWidth >= 7.999);
      assert.ok(center.x + item.x + item.halfWidth <= viewportWidth - 7.999);
      assert.ok(center.y + item.y - item.halfHeight >= 7.999);
      assert.ok(center.y + item.y + item.halfHeight <= viewportHeight - 7.999);
    }
  }
});

test("the complete stack-choice bounds stay inside every viewport edge", () => {
  const viewportWidth = 390;
  const viewportHeight = 800;
  const positions = calculateStackDestinationPositions(105);
  const bounds = calculateStackDestinationVisualBounds(positions, viewportWidth);
  const center = calculateMarkingMenuCenter(viewportWidth, viewportHeight, viewportWidth, viewportHeight, bounds);
  for (const item of bounds) {
    assert.ok(center.x + item.x + item.halfWidth <= viewportWidth - 7.999);
    assert.ok(center.y + item.y + item.halfHeight <= viewportHeight - 7.999);
  }
});

test("pointerup uses the latest Maya menu completion callback after the menu opens", () => {
  assert.ok(board.includes("const markingMenuEnd = useRef(onMarkingMenuEnd);"));
  assert.ok(board.includes("markingMenuEnd.current = onMarkingMenuEnd;"));
  assert.ok(board.includes("markingMenuEnd.current(event.clientX, event.clientY);"));
});

test("stack destination menu exposes five gesture directions", () => {
  const positions = calculateStackDestinationPositions(100);
  assert.deepEqual(STACK_DESTINATION_ITEMS.map((item) => item.action), [
    "face_down_top",
    "face_up_top",
    "spread",
    "face_down_bottom",
    "face_up_bottom",
  ]);
  assert.equal(selectStackDestinationItem(positions, -80, -80)?.action, "face_down_top");
  assert.equal(selectStackDestinationItem(positions, 80, -80)?.action, "face_up_top");
  assert.equal(selectStackDestinationItem(positions, 120, 0)?.action, "spread");
  assert.equal(selectStackDestinationItem(positions, -80, 80)?.action, "face_down_bottom");
  assert.equal(selectStackDestinationItem(positions, 80, 80)?.action, "face_up_bottom");
});

test("stack destination gesture cancels in the center and outside its active ring", () => {
  const positions = calculateStackDestinationPositions(100);
  assert.equal(selectStackDestinationItem(positions, 10, 10), null);
  assert.equal(selectStackDestinationItem(positions, 500, 0)?.action, "spread");
  assert.equal(selectStackDestinationItem(positions, 750, 0), null);
});

test("continuous circles can cross the horizontal boundary repeatedly without losing a selection", () => {
  const regular = calculateMarkingMenuPositions(DEFAULT_MARKING_MENU_ITEMS, 500, 1000);
  const stack = calculateStackDestinationPositions(100);
  const regularSelections = new Set();
  const stackSelections = new Set();
  for (let turn = 0; turn < 4; turn += 1) {
    for (let degree = 0; degree < 360; degree += 2) {
      const radians = (degree + turn * 360) * Math.PI / 180;
      const x = Math.sin(radians) * 100;
      const y = -Math.cos(radians) * 100;
      regularSelections.add(selectMarkingMenuItem(regular, x, y)?.slot);
      stackSelections.add(selectStackDestinationItem(stack, x, y)?.action);
    }
  }
  assert.deepEqual([...regularSelections].filter(Boolean).sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...stackSelections].filter(Boolean).sort(), STACK_DESTINATION_ITEMS.map((item) => item.action).sort());
});

test("stack destination long press stays in the Maya pointer lifecycle", () => {
  assert.ok(board.includes("pointerX: x, pointerY: y"));
  assert.ok(board.includes("finishDestinationStackMenu"));
  assert.ok(board.includes("<StackDestinationMarkingMenu"));
  assert.ok(!board.includes("destination-stack-menu\" onClick"));
});

test("all Maya pointer visuals are limited to one update per animation frame", () => {
  assert.ok(board.includes("markingPointerFrame.current = window.requestAnimationFrame"));
  assert.ok(board.includes("queuedMarkingPointer.current = { x, y };"));
  assert.ok(!board.includes("function moveMarkingMenuPointer(x: number, y: number) {\n    setMarkingMenu"));
});

test("an open Maya menu receives pointer movement before horizontal zone-scroll classification", () => {
  const pointerMoveStart = board.indexOf("function pointerMove(event: PointerEvent)");
  const pointerMoveEnd = board.indexOf("function pointerUp(event: PointerEvent)", pointerMoveStart);
  const pointerMove = board.slice(pointerMoveStart, pointerMoveEnd);
  assert.ok(pointerMove.indexOf("if (markingMenuOpen.current)") < pointerMove.indexOf("const horizontalWithinScrollAngle"));
  assert.ok(pointerMove.indexOf("onMarkingMenuMove(event.clientX, event.clientY)") < pointerMove.indexOf("const horizontalWithinScrollAngle"));
});

test("その他は指を離さず300ms保持した時だけ同形式の第二層へ切り替わる", () => {
  assert.equal(OTHER_BRANCH_HOLD_MS, 300);
  assert.ok(board.includes("selected?.action === \"other\""));
  assert.ok(board.includes("window.setTimeout(() =>"));
  assert.ok(board.includes("{ ...latest, branch: \"other\" }"));
  assert.ok(board.includes("menu.branch === \"other\" ? getOtherContextualActions(menu.items) : menu.items"));
  assert.ok(!board.includes('menu.branch === "other" ? (\n          <div className="marking-menu-branch">'));
});

test("確認はYES/NO確認後に表面表示・相手の目印・別場所タップ解除を使う", () => {
  assert.ok(board.includes('if (action === "inspect") setInspectionConfirm'));
  assert.ok(board.includes("非公開カードを確認すると相手へ通知されます。"));
  assert.ok(board.includes("if (onInspectionRequest) onInspectionRequest(pending)"));
  assert.ok(board.includes('isCardFaceVisible({ face: card.face, inspected, inspectionViewer'));
  assert.ok(board.includes('aria-label="確認中" className="card-inspection-eye"'));
  assert.ok(board.includes('document.addEventListener("pointerdown", clearOnNextScreenPointer, true)'));
  assert.ok(!board.includes('if (action === "inspect") setDetail'));
});


