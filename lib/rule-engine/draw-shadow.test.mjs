import assert from "node:assert/strict";
import test from "node:test";

import { drawRandomCard } from "../playfield-board.ts";
import {
  applyDrawResolutionToLegacyBoard,
  compareLegacyDrawBoards,
  projectLegacyBoardForDraw,
} from "./adapters/legacy-board.ts";
import { resolveRuleAction } from "./engine.ts";

const zones = (deck, hand) => ({
  deck,
  hand,
  shield: [],
  mana: [],
  battle: [],
  graveyard: [],
  hyperspatial: [],
  gr: [],
  abyss: [],
  reveal: [],
});
const card = (instanceId, overrides = {}) => ({
  instanceId,
  canonicalCardId: Number(instanceId.replace(/\D/g, "")) || 1,
  name: instanceId,
  imageUrl: null,
  face: "face_down",
  tapped: true,
  shieldMarker: { turn: 1, order: 1 },
  markers: [],
  stackId: null,
  stackOrder: null,
  stackLayout: null,
  stackPlacement: null,
  attachedToStackId: null,
  ...overrides,
});
const fixture = () => ({
  players: {
    p1: zones([card("d1"), card("d2"), card("d3")], [card("h1", { face: "owner_only", tapped: false, shieldMarker: null })]),
    p2: zones([card("p2d1")], [card("p2h1", { face: "owner_only", tapped: false, shieldMarker: null })]),
  },
  revealPublic: { p1: false, p2: false },
  turn: 1,
  activePlayer: "p1",
  shieldPlacementOrder: { p1: 1, p2: 1 },
  notifications: [],
  turnRequest: null,
  inspection: null,
});

test("normal DRAW shadow is a strict legacy match [DRAW-001, DRAW-002]", () => {
  const input = fixture();
  const legacy = drawRandomCard(input, "p1");
  const resolution = resolveRuleAction(projectLegacyBoardForDraw(input), {
    type: "DRAW",
    actor: "p1",
    count: 1,
    cause: { type: "MANUAL" },
  });
  const shadow = applyDrawResolutionToLegacyBoard(input, resolution);

  assert.equal(compareLegacyDrawBoards(legacy, shadow, "p1"), "STRICT_MATCH");
  assert.equal(shadow.players.p1.deck.length, legacy.players.p1.deck.length);
  assert.equal(shadow.players.p1.hand.length, legacy.players.p1.hand.length);
  assert.deepEqual(shadow.players.p1.deck.map(({ instanceId }) => instanceId), legacy.players.p1.deck.map(({ instanceId }) => instanceId));
  assert.deepEqual(shadow.players.p1.hand.map(({ instanceId }) => instanceId), legacy.players.p1.hand.map(({ instanceId }) => instanceId));
  assert.deepEqual(shadow.players.p1.hand.at(-1), legacy.players.p1.hand.at(-1));
});
