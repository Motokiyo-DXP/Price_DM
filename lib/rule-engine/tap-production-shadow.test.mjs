import assert from "node:assert/strict";
import test from "node:test";

import { toggleLegacyCardTapState } from "../playfield-board.ts";
import { runTapProductionShadow, toggleCardTapWithProductionShadow } from "./shadow/tap.ts";

const card = (instanceId, tapped = false) => ({
  instanceId, canonicalCardId: 1, name: instanceId, imageUrl: null,
  face: "face_up", tapped, shieldMarker: null, markers: ["keep_tapped"],
  stackId: null, stackOrder: null, stackLayout: null, stackPlacement: null, attachedToStackId: null,
});
const zones = (prefix) => ({
  deck: [], hand: [], shield: [], mana: [card(`${prefix}-m1`), card(`${prefix}-m2`, true)],
  battle: [card(`${prefix}-b1`)], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [],
});
const fixture = () => ({
  players: { p1: zones("p1"), p2: zones("p2") },
  turn: 4, activePlayer: "p1", notifications: [],
});

for (const owner of ["p1", "p2"]) {
  for (const clearKeepTappedOnUntap of [true, false]) {
    test(`single mana TAP matches Legacy for ${owner}, policy ${clearKeepTappedOnUntap}`, () => {
      const current = fixture();
      const options = { clearKeepTappedOnUntap };
      const warnings = [];
      const result = runTapProductionShadow(current, owner, `${owner}-m1`, options, { warn: (...args) => warnings.push(args) });
      const legacy = toggleLegacyCardTapState(current, owner, "mana", `${owner}-m1`, options);
      assert.deepEqual(result.board, legacy);
      assert.equal(result.status, "STRICT_MATCH");
      assert.deepEqual(warnings, []);
      assert.equal(result.board.players[owner].mana[0].tapped, true);
      assert.strictEqual(result.board.players[owner].mana[1], current.players[owner].mana[1]);
      assert.strictEqual(result.board.players[owner === "p1" ? "p2" : "p1"], current.players[owner === "p1" ? "p2" : "p1"]);
      assert.strictEqual(result.board.notifications, current.notifications);
      assert.equal(current.players[owner].mana[0].tapped, false);
    });
  }
}

test("Shadow failure returns only the Legacy board and does not leak error contents", () => {
  const current = fixture();
  const warnings = [];
  const options = { clearKeepTappedOnUntap: true };
  const result = runTapProductionShadow(current, "p1", "p1-m1", options, {
    shadowRunner: () => { throw new Error("private card contents"); },
    warn: (...args) => warnings.push(args),
  });
  assert.deepEqual(result.board, toggleLegacyCardTapState(current, "p1", "mana", "p1-m1", options));
  assert.equal(result.status, "UNDETERMINED");
  assert.deepEqual(warnings, [["[rule-shadow][TAP] shadow calculation failed", { player: "p1", status: "UNDETERMINED" }]]);
  assert.equal(JSON.stringify(warnings).includes("private card contents"), false);
});

test("mismatch and logging failure cannot change the Production TAP", () => {
  const current = fixture();
  const options = { clearKeepTappedOnUntap: false };
  const result = runTapProductionShadow(current, "p1", "p1-m1", options, {
    shadowRunner: () => "MISMATCH",
    warn: () => { throw new Error("logger unavailable"); },
  });
  assert.deepEqual(result.board, toggleLegacyCardTapState(current, "p1", "mana", "p1-m1", options));
  assert.equal(result.status, "MISMATCH");
});

test("UI routing excludes already-tapped mana, other zones, and absent cards from Shadow", () => {
  const current = fixture();
  for (const [zone, cardId] of [["mana", "p1-m2"], ["battle", "p1-b1"], ["mana", "absent"]]) {
    for (const clearKeepTappedOnUntap of [true, false]) {
      const options = { clearKeepTappedOnUntap };
      const result = toggleCardTapWithProductionShadow(current, "p1", zone, cardId, options, {
        shadowRunner: () => { throw new Error("excluded operation reached Shadow"); },
        warn: () => { throw new Error("excluded operation warned"); },
      });
      assert.deepEqual(result, toggleLegacyCardTapState(current, "p1", zone, cardId, options));
    }
  }
});

test("UI routing sends an untapped mana card to the TAP Shadow", () => {
  const current = fixture();
  let calls = 0;
  const options = { clearKeepTappedOnUntap: true };
  const board = toggleCardTapWithProductionShadow(current, "p1", "mana", "p1-m1", options, {
    shadowRunner: () => { calls += 1; return "STRICT_MATCH"; },
  });
  assert.equal(calls, 1);
  assert.deepEqual(board, toggleLegacyCardTapState(current, "p1", "mana", "p1-m1", options));
});
