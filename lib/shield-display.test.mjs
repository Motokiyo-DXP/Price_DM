import assert from "node:assert/strict";
import test from "node:test";
import { shieldDisplay } from "./shield-display.ts";
import { isCardFaceVisible } from "./playfield-visibility.ts";

const card = (instanceId, extra = {}) => ({ instanceId, canonicalCardId: 1, name: instanceId, imageUrl: null, face: "face_down", tapped: false, shieldMarker: null, ...extra });
const ids = (cards) => shieldDisplay(cards).cards.map((c) => c.instanceId);

test("stable priority partition preserves state and restores original positions", () => {
  const cards = [card("a"), card("b", { face: "face_up" }), card("c"), card("d", { markers: ["shield_force"] }), card("e", { shieldMarker: { order: 1 } })];
  const before = structuredClone(cards);
  assert.deepEqual(ids(cards), ["b", "d", "e", "a", "c"]);
  assert.deepEqual(cards, before);
  assert.ok(shieldDisplay(cards).cards.every((c) => cards.includes(c)));
  cards[1] = { ...cards[1], face: "face_down" };
  cards[3] = { ...cards[3], markers: [] };
  cards[4] = { ...cards[4], shieldMarker: null };
  assert.deepEqual(ids(cards), ["a", "b", "c", "d", "e"]);
});

test("either condition alone maintains priority and markers do not reveal faces", () => {
  for (const face of ["face_up", "face_down"]) for (const markers of [[], ["shield_force"], ["blocker"]]) {
    const target = card("b", { face, markers });
    assert.deepEqual(ids([card("a"), target]), face === "face_up" || markers.length ? ["b", "a"] : ["a", "b"]);
    for (const owner of ["p1", "p2"]) for (const view of ["p1", "p2"]) {
      assert.equal(isCardFaceVisible({ face, owner, view, zone: "shield" }), face === "face_up");
    }
  }
});

test("connected shields move as a unit without changing internal order or stack metadata", () => {
  const cards = [card("normal"), card("root", { stackId: "root" }), card("child", { stackId: "child", attachedToStackId: "root", stackLayout: "spread", markers: ["shield_force"] }), card("top", { stackId: "root", stackOrder: 1 }), card("last")];
  assert.deepEqual(ids(cards), ["root", "child", "top", "normal", "last"]);
  assert.deepEqual([...shieldDisplay(cards).priorityIds], ["stack:root"]);
  assert.deepEqual(ids(cards.filter((c) => c.instanceId !== "child")), ["normal", "root", "top", "last"]);
});

test("synced replacements, removals and additions recompute priority", () => {
  const initial = [card("a"), card("b")];
  const synced = JSON.parse(JSON.stringify([initial[0], { ...initial[1], markers: ["shield_force"] }]));
  assert.deepEqual(ids(synced), ["b", "a"]);
  assert.deepEqual(ids(synced.slice(0, 1)), ["a"]);
  assert.deepEqual(ids([...synced, card("c", { face: "face_up" })]), ["b", "c", "a"]);
  assert.deepEqual(ids([]), []);
});
