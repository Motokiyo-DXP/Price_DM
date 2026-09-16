import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bundleSelectedCards, flipStackCards, initialBoard, moveCardsBetweenZones, resolveDraggedCardIds, setCardMarker, shuffleStackCards, toggleLegacyCardTapState } from "./playfield-board.ts";

const source = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
const cards = Array.from({ length: 10 }, (_, index) => ({ id: `card-${index}`, name: `Card ${index}`, quantity: 1 }));

test("展開カードのメニューと移動先選択は個別スコープを維持する", () => {
  assert.match(source, /onMarkingMenuStart\(owner, zone, card, start\.current\.x, start\.current\.y, false, individualFromStack\)/);
  assert.match(source, /setMarkingMenu\(\{ branch: null, card, individual,/);
  assert.match(source, /const ids = markingMenu\.individual \? new Set\(\[markingMenu\.card\.instanceId\]\)/);
  assert.match(source, /setPendingMoveSelection\(\{ cardId: markingMenu\.card\.instanceId,[^}]*individual: markingMenu\.individual \}\)/);
  assert.match(source, /moveCard\(pending\.owner, pending\.from, pending\.cardId, zone, undefined, undefined, pending\.individual\)/);
  assert.match(source, /moveCard\(markingMenu\.owner, markingMenu\.zone, markingMenu\.card\.instanceId, zone, undefined, undefined, markingMenu\.individual\)/);
  assert.match(source, /isStack: Boolean\(card\.stackId\) && !individual/);
});
test("3枚束の個別更新と束全体操作は別のカード集合に作用する", () => {
  const board = initialBoard(cards, () => 0.5);
  const selected = board.players.p1.hand.slice(0, 3).map((card) => card.instanceId);
  const bundled = bundleSelectedCards(board, new Set(selected));
  const inBattle = moveCardsBetweenZones(bundled, "p1", "hand", "battle", new Set(selected));
  const stackId = inBattle.players.p1.battle.find((card) => selected.includes(card.instanceId)).stackId;
  const one = selected[0];
  const flipped = { ...inBattle, players: { ...inBattle.players, p1: { ...inBattle.players.p1, battle: inBattle.players.p1.battle.map((card) => card.instanceId === one ? { ...card, face: "face_down" } : card) } } };
  assert.deepEqual(flipped.players.p1.battle.filter((card) => selected.includes(card.instanceId)).map((card) => card.face), ["face_down", "face_up", "face_up"]);
  const tapped = toggleLegacyCardTapState(flipped, "p1", "battle", one, { clearKeepTappedOnUntap: true });
  assert.deepEqual(tapped.players.p1.battle.filter((card) => selected.includes(card.instanceId)).map((card) => card.tapped), [true, false, false]);
  const marked = setCardMarker(tapped, "p1", "battle", one, "keep_tapped", true);
  assert.deepEqual(marked.players.p1.battle.filter((card) => selected.includes(card.instanceId)).map((card) => card.markers?.includes("keep_tapped")), [true, false, false]);
  const moved = moveCardsBetweenZones(marked, "p1", "battle", "graveyard", new Set([one]));
  assert.deepEqual(moved.players.p1.battle.filter((card) => selected.includes(card.instanceId)).map((card) => card.instanceId), selected.slice(1));
  assert.deepEqual(moved.players.p1.graveyard.filter((card) => selected.includes(card.instanceId)).map((card) => card.instanceId), [one]);
  assert.deepEqual(resolveDraggedCardIds(inBattle.players.p1.battle, one), new Set(selected));
  const wholeMoved = moveCardsBetweenZones(inBattle, "p1", "battle", "graveyard", resolveDraggedCardIds(inBattle.players.p1.battle, one));
  assert.equal(wholeMoved.players.p1.graveyard.filter((card) => card.stackId === stackId).length, 3);
  const wholeFlipped = flipStackCards(inBattle, "p1", "battle", stackId);
  assert.equal(wholeFlipped.players.p1.battle.filter((card) => card.stackId === stackId && card.face === "face_down").length, 3);
  const shuffled = shuffleStackCards(inBattle, "p1", "battle", stackId, () => 0);
  assert.equal(shuffled.players.p1.battle.filter((card) => card.stackId === stackId && card.face === "face_down").length, 3);
});

