import assert from "node:assert/strict";
import test from "node:test";
import { moveCardsBetweenZones } from "../playfield-board.ts";
import { projectLegacyBoardForCharge, compareLegacyChargeResult } from "./adapters/charge-test-shadow.ts";
import { resolveRuleAction } from "./engine.ts";

const card = (instanceId, overrides = {}) => ({
  instanceId,
  canonicalCardId: 1,
  civilizations: ["fire"],
  name: instanceId,
  imageUrl: null,
  face: "owner_only",
  tapped: true,
  shieldMarker: { turn: 1, order: 1 },
  markers: ["keep_tapped"],
  stackId: null,
  stackOrder: null,
  stackLayout: null,
  stackPlacement: null,
  attachedToStackId: null,
  ...overrides,
});
const zones = (prefix) => ({
  deck: [card(`${prefix}d1`)],
  hand: [card(`${prefix}h1`), card(`${prefix}h2`), card(`${prefix}h3`)],
  graveyard: [card(`${prefix}g1`, { face: "face_up", tapped: false, shieldMarker: null, markers: [] })],
  shield: [card(`${prefix}s1`)], mana: [card(`${prefix}m1`), card(`${prefix}m2`)], battle: [], hyperspatial: [], gr: [], abyss: [], reveal: [],
});
const fixture = () => ({
  players: { p1: zones("p1"), p2: zones("p2") },
  revealPublic: { p1: false, p2: false },
  turn: 1,
  activePlayer: "p1",
  shieldPlacementOrder: { p1: 1, p2: 1 },
  notifications: [],
  turnRequest: null,
  inspection: null,
});


for (const player of ["p1", "p2"]) for (const civilizations of [["fire"], ["water", "fire"], ["zero"], [" Fire ", "fire"]]) {
  test(`${player} CHARGE ${civilizations} STRICT_MATCH with independent Legacy result`, () => {
    const input = fixture();
    input.players[player].hand[1].civilizations = civilizations;
    input.players[player].hand[1].stackId = "partial-stack";
    input.players[player].hand[0].stackId = "partial-stack";
    const before = structuredClone(input);
    const action = { type: "CHARGE", actor: player, cardInstanceId: `${player}h2`, cause: { type: "MANUAL" } };
    const projected = projectLegacyBoardForCharge(input, action);
    const result = resolveRuleAction(projected, action);
    const legacy = moveCardsBetweenZones(input, player, "hand", "mana", new Set([action.cardInstanceId]));
    assert.equal(compareLegacyChargeResult(legacy, input, result), "STRICT_MATCH");
    assert.strictEqual(result.state.players[player].mana.at(-1).card, projected.players[player].hand[1]);
    assert.deepEqual(input, before);
    const altered = structuredClone(legacy);
    altered.players[player].mana.at(-1).tapped = !altered.players[player].mana.at(-1).tapped;
    assert.equal(compareLegacyChargeResult(altered, input, result), "MISMATCH");
    const reordered = structuredClone(legacy);
    reordered.players[player].hand.reverse();
    assert.equal(compareLegacyChargeResult(reordered, input, result), "MISMATCH");
    const other = player === "p1" ? "p2" : "p1";
    const interfered = structuredClone(legacy);
    interfered.players[other].deck = [];
    assert.equal(compareLegacyChargeResult(interfered, input, result), "MISMATCH");
  });
}
for (const civilizations of [undefined, [], ["unknown"], ["fire", "unknown"], ["zero", "fire"]]) {
  test(`CHARGE projection rejects unverified metadata ${JSON.stringify(civilizations)}`, () => {
    const input = fixture();
    input.players.p1.hand[1].civilizations = civilizations;
    assert.throws(() => projectLegacyBoardForCharge(input, { type: "CHARGE", actor: "p1", cardInstanceId: "p1h2" }), /projection failed/);
  });
}
test("CHARGE projection rejects missing ID before resolution", () => {
  assert.throws(() => projectLegacyBoardForCharge(fixture(), { type: "CHARGE", actor: "p1", cardInstanceId: "p2h2" }), /not in actor's hand/);
});
