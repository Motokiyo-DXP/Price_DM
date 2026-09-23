import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
const cardView = source.slice(source.indexOf("function CardView("), source.indexOf("type ZoneProps"));

test("CardView handles double taps through pointer timing only, avoiding duplicate native dblclick handling", () => {
  assert.match(cardView, /if \(now - lastTapAt\.current <= 260\)\s*\{\s*lastTapAt\.current = 0;\s*onDoubleTap\(owner, zone, card, individualFromStack\);/);
  assert.doesNotMatch(cardView, /onDoubleClick=/);
  assert.doesNotMatch(cardView, /function doubleClick\(/);
});

test("deck top and bottom placement hit areas take precedence over the overlapping inspection viewer", () => {
  const pointerMove = source.slice(source.indexOf("function pointerMove("), source.indexOf("function pointerUp("));
  const pointerUp = source.slice(source.indexOf("function pointerUp("), source.indexOf("function pointerCancel("));
  assert.match(pointerMove, /if \(viewer && !isDeckPlacementPoint\(owner, event\.clientX, event\.clientY\)\)/);
  assert.match(pointerUp, /if \(viewer && !isDeckPlacementPoint\(owner, event\.clientX, event\.clientY\)\)/);
  assert.doesNotMatch(cardView, /!deckViewer\s*\?\s*<DeckPlacementPreview/);
});
