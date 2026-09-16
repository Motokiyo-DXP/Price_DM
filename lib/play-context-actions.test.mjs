import assert from "node:assert/strict";
import test from "node:test";
import { getContextualActions, getOtherContextualActions } from "./play-context-actions.ts";

const actions = (context) => getContextualActions(context).map((item) => item.action);
test("状況に応じてMaya第一階層を切り替える", () => {
  const untapped = getContextualActions({ face: "face_up", tapped: false, zone: "battle" });
  assert.deepEqual(untapped.map(({ slot, action }) => [slot, action]), [[1,"multi_select"],[2,"target"],[3,"move"],[4,"mark"],[5,"flip"],[6,"other"]]);
  const tapped = getContextualActions({ face: "face_up", tapped: true, zone: "battle" });
  assert.equal(tapped.find(({ slot }) => slot === 2)?.action, "target");
  assert.equal(tapped.find(({ slot }) => slot === 3)?.action, "move");
  const multi = getContextualActions({ face: "face_up", isMultiSelectMode: true, selectedCount: 2, tapped: false, zone: "battle" });
  assert.deepEqual(multi.map(({ slot, action }) => [slot, action]), [[1,"deselect"],[2,"shuffle"],[3,"move"],[4,"bundle"],[5,"flip"],[6,"other"]]);
  const stack = getContextualActions({ face: "face_up", isStack: true, tapped: false, zone: "battle" });
  assert.equal(stack.find(({ slot }) => slot === 2)?.action, "shuffle_stack");
  assert.equal(stack.find(({ slot }) => slot === 4)?.action, "open_stack");
  assert.equal(stack.find(({ slot }) => slot === 4)?.label, "束を開く");
  assert.equal(stack.find(({ slot }) => slot === 5)?.action, "flip_stack");
  const shield = getContextualActions({ face: "face_down", tapped: false, zone: "shield" });
  assert.equal(shield.find(({ slot }) => slot === 2)?.action, "inspect");
  assert.equal(shield.find(({ slot }) => slot === 4)?.action, "mark");
  assert.equal(shield.find(({ slot }) => slot === 5)?.action, "flip");
  const hand = getContextualActions({ face: "owner_only", tapped: false, zone: "hand" });
  assert.equal(hand.find(({ slot }) => slot === 2)?.action, "publish");
  assert.equal(hand.find(({ slot }) => slot === 5)?.action, "flip");
  assert.ok(!actions({ face: "face_up", tapped: false, zone: "reveal" }).includes("publish"));
  const deck = getContextualActions({ face: "face_down", playerSide: "self", tapped: false, zone: "deck" });
  assert.deepEqual(deck.map(({ slot, action }) => [slot, action]), [[1,"view_deck"],[2,"shuffle"],[3,"move"],[4,"yobinion"],[6,"other"]]);
  assert.equal(deck[0].label, "山札閲覧");
  assert.equal(deck[3].label, "ヨビニオン");
  const opponentDeck = getContextualActions({ face: "face_down", playerSide: "opponent", tapped: false, zone: "deck" });
  assert.ok(!opponentDeck.some(({ action }) => action === "view_deck"));
  const deckCard = getContextualActions({ face: "face_down", deckCard: true, playerSide: "self", tapped: false, zone: "deck" });
  assert.deepEqual(deckCard.map(({ slot, action }) => [slot, action]), [[1,"multi_select"],[3,"move"],[5,"flip"],[6,"other"]]);
});

test("その他の第二層は同形式の2〜6番を使い第一層との重複を隠す", () => {
  const firstLayer = getContextualActions({ face: "face_up", tapped: false, zone: "battle" });
  assert.deepEqual(getOtherContextualActions(firstLayer).map(({ slot, action }) => [slot, action]), [
    [2, "details"], [3, "toggle_tap"], [4, "effect_warning"], [5, "yobinion"],
  ]);
  const regular = getContextualActions({ face: "face_up", tapped: false, zone: "mana" });
  assert.deepEqual(getOtherContextualActions(regular).map(({ slot, action }) => [slot, action]), [
    [2, "details"], [3, "toggle_tap"], [4, "effect_warning"], [5, "yobinion"], [6, "mark_general"],
  ]);
  const stack = getContextualActions({ face: "face_up", isStack: true, tapped: false, zone: "battle" });
  assert.deepEqual(getOtherContextualActions(stack).map(({ slot, action }) => [slot, action]), [
    [1, "unbundle_stack"], [2, "details"], [3, "toggle_tap"], [4, "effect_warning"], [5, "yobinion"], [6, "mark_general"],
  ]);
  assert.equal(getOtherContextualActions(stack)[0].label, "束を解除");
});
