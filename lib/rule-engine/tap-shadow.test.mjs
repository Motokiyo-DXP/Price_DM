import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTapResolutionToLegacyBoard,
  compareLegacyTapBoards,
  projectLegacyBoardForTap,
} from "./adapters/legacy-board.ts";
import { resolveRuleAction } from "./engine.ts";

const card = (instanceId, overrides = {}) => ({
  instanceId, canonicalCardId: 1, name: instanceId, imageUrl: null,
  face: "face_up", tapped: false, shieldMarker: null, markers: ["keep_tapped"],
  stackId: "stack-1", stackOrder: 2, stackLayout: "overlap", stackPlacement: null,
  attachedToStackId: null, ...overrides,
});
const zones = (prefix) => ({
  deck: [card(`${prefix}d1`)], hand: [card(`${prefix}h1`)], graveyard: [card(`${prefix}g1`)],
  mana: [card(`${prefix}m1`), card(`${prefix}m2`), card(`${prefix}m3`)],
  shield: [], battle: [], hyperspatial: [], gr: [], abyss: [], reveal: [],
});
const fixture = () => ({
  players: { p1: zones("p1"), p2: zones("p2") },
  revealPublic: { p1: false, p2: false }, turn: 1, activePlayer: "p1",
  shieldPlacementOrder: { p1: 1, p2: 1 }, notifications: [], turnRequest: null, inspection: null,
});

// Test-only baseline copied from the present Production mana false -> true TAP branch.
// It intentionally does not use the Rule primitive or Rule adapter.
function legacyManaTap(board, player, target) {
  return { ...board, players: { ...board.players, [player]: {
    ...board.players[player],
    mana: board.players[player].mana.map((item) => item.instanceId === target
      ? { ...item, tapped: true }
      : item),
  } } };
}

for (const player of ["p1", "p2"]) {
  test(`${player} mana false -> true TAP strict-matches independent Legacy baseline`, () => {
    const input = fixture();
    const target = `${player}m2`;
    const legacy = legacyManaTap(input, player, target);
    const projected = projectLegacyBoardForTap(input);
    for (const owner of ["p1", "p2"]) {
      assert.deepEqual(projected.players[owner].mana.map((item) => item.card.instanceId),
        input.players[owner].mana.map((item) => item.instanceId));
      assert.strictEqual(projected.players[owner].mana[1].card.payload, input.players[owner].mana[1]);
    }
    const resolution = resolveRuleAction(projected, {
      type: "TAP", actor: player, cardInstanceId: target, zone: "mana", cause: { type: "MANUAL" },
    });
    const shadow = applyTapResolutionToLegacyBoard(input, resolution);
    const other = player === "p1" ? "p2" : "p1";

    assert.equal(compareLegacyTapBoards(legacy, shadow, player), "STRICT_MATCH");
    assert.deepEqual(shadow.players[player].mana, legacy.players[player].mana);
    assert.deepEqual(shadow.players[player].mana.map((item) => item.instanceId),
      [`${player}m1`, `${player}m2`, `${player}m3`]);
    assert.strictEqual(shadow.players[player].mana[0], input.players[player].mana[0]);
    assert.strictEqual(shadow.players[player].mana[2], input.players[player].mana[2]);
    for (const zone of ["deck", "hand", "graveyard"]) {
      assert.strictEqual(shadow.players[player][zone], input.players[player][zone]);
    }
    assert.strictEqual(shadow.players[other], input.players[other]);
    assert.strictEqual(shadow.notifications, input.notifications);
  });
}

test("TAP comparator detects tapped and presentation mismatches", () => {
  const legacy = legacyManaTap(fixture(), "p1", "p1m2");
  for (const changed of [{ tapped: false }, { markers: [] }]) {
    const altered = { ...legacy, players: { ...legacy.players, p1: {
      ...legacy.players.p1,
      mana: legacy.players.p1.mana.map((item, index) => index === 1 ? { ...item, ...changed } : item),
    } } };
    assert.equal(compareLegacyTapBoards(legacy, altered, "p1"), "MISMATCH");
  }
});
