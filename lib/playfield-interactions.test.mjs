import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPointerGesture,
  moveDefaults,
  validateManaPayment,
} from "./playfield-interactions.ts";

test("ドラッグを長押しやタップより優先する", () => {
  assert.equal(classifyPointerGesture({ durationMs: 700, distancePx: 9 }), "drag");
  assert.equal(classifyPointerGesture({ durationMs: 500, distancePx: 0 }), "long_press");
  assert.equal(classifyPointerGesture({ durationMs: 180, distancePx: 2 }), "tap");
  assert.equal(classifyPointerGesture({ durationMs: 300, distancePx: 2 }), "none");
});

test("山札とシールドは裏向き、手札は所有者限定、それ以外は表向きにする", () => {
  assert.equal(moveDefaults("hand", "deck", { turn: 2, shieldPlacementOrder: 1 }).face, "face_down");
  assert.equal(moveDefaults("deck", "hand", { turn: 2, shieldPlacementOrder: 1 }).face, "owner_only");
  assert.equal(moveDefaults("hand", "mana", { turn: 2, shieldPlacementOrder: 1 }).face, "face_up");
  assert.deepEqual(moveDefaults("hand", "shield", { turn: 2, shieldPlacementOrder: 3 }), {
    face: "face_down",
    shieldMarker: { turn: 2, order: 3 },
  });
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
