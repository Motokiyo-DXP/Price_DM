import assert from "node:assert/strict";
import test from "node:test";

import { moveCardsBetweenZones } from "../playfield-board.ts";
import {
  applyDiscardResolutionToLegacyBoard,
  compareLegacyDiscardBoards,
  projectLegacyBoardForDiscard,
} from "./adapters/legacy-board.ts";
import { resolveRuleAction } from "./engine.ts";

const card = (instanceId, overrides = {}) => ({
  instanceId,
  canonicalCardId: 1,
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
  shield: [], mana: [], battle: [], hyperspatial: [], gr: [], abyss: [], reveal: [],
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

for (const [player, selected] of [["p1", "p1h2"], ["p2", "p2h2"]]) {
  test(`${player} DISCARD strict-matches Legacy for a middle hand card and existing graveyard`, () => {
    const input = fixture();
    const legacy = moveCardsBetweenZones(input, player, "hand", "graveyard", new Set([selected]));
    const resolution = resolveRuleAction(projectLegacyBoardForDiscard(input), {
      type: "DISCARD", actor: player, cardInstanceId: selected, cause: { type: "MANUAL" },
    });
    const shadow = applyDiscardResolutionToLegacyBoard(input, resolution);
    const other = player === "p1" ? "p2" : "p1";

    assert.equal(compareLegacyDiscardBoards(legacy, shadow, player), "STRICT_MATCH");
    assert.deepEqual(shadow.players[player].hand.map((c) => c.instanceId), [`${player}h1`, `${player}h3`]);
    assert.deepEqual(shadow.players[player].graveyard.map((c) => c.instanceId), [`${player}g1`, selected]);
    assert.deepEqual(shadow.players[player].graveyard.at(-1), legacy.players[player].graveyard.at(-1));
    assert.strictEqual(resolution.state.players[player].graveyard.at(-1).payload, input.players[player].hand[1]);
    assert.strictEqual(shadow.players[other], input.players[other]);
    assert.strictEqual(shadow.players[player].deck, input.players[player].deck);
    assert.strictEqual(shadow.notifications, input.notifications);
  });
}

test("DISCARD comparator detects presentation mismatch", () => {
  const input = fixture();
  const legacy = moveCardsBetweenZones(input, "p1", "hand", "graveyard", new Set(["p1h2"]));
  const altered = { ...legacy, players: { ...legacy.players, p1: {
    ...legacy.players.p1,
    graveyard: [...legacy.players.p1.graveyard.slice(0, -1), { ...legacy.players.p1.graveyard.at(-1), face: "owner_only" }],
  } } };
  assert.equal(compareLegacyDiscardBoards(legacy, altered, "p1"), "MISMATCH");
});
