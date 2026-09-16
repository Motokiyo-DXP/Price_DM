import assert from "node:assert/strict";
import test from "node:test";

import { drawRandomCard } from "../playfield-board.ts";
import { runDrawProductionShadow } from "./shadow/draw.ts";

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

const zones = (prefix, deck = [card(`${prefix}-d1`), card(`${prefix}-d2`)]) => ({
  deck,
  hand: [card(`${prefix}-h1`, { face: "owner_only", tapped: false, shieldMarker: null })],
  shield: [card(`${prefix}-s1`)],
  mana: [card(`${prefix}-m1`)],
  battle: [card(`${prefix}-b1`)],
  graveyard: [card(`${prefix}-g1`)],
  hyperspatial: [card(`${prefix}-x1`)],
  gr: [card(`${prefix}-gr1`)],
  abyss: [card(`${prefix}-a1`)],
  reveal: [card(`${prefix}-r1`)],
});

const fixture = (p1Deck) => ({
  players: {
    p1: zones("p1", p1Deck),
    p2: zones("p2"),
  },
  revealPublic: { p1: false, p2: true },
  turn: 7,
  activePlayer: "p2",
  shieldPlacementOrder: { p1: 4, p2: 5 },
  notifications: [{ id: "notice-1", recipient: "p1", message: "existing", createdAt: 1 }],
  turnRequest: { requester: "p1", requestedAt: 2 },
  inspection: { owner: "p2", zone: "deck", cardIds: ["p2-d1"] },
});

const unchangedZones = ["shield", "mana", "battle", "graveyard", "hyperspatial", "gr", "abyss", "reveal"];
const unchangedMetadata = ["turn", "activePlayer", "shieldPlacementOrder", "notifications", "turnRequest", "inspection"];

test("production DRAW returns the Legacy board and a strict Shadow match", () => {
  const input = fixture();
  const legacy = drawRandomCard(input, "p1");
  const warnings = [];
  const result = runDrawProductionShadow(input, "p1", { warn: (...args) => warnings.push(args) });

  assert.deepEqual(result.board, legacy);
  assert.equal(result.status, "STRICT_MATCH");
  assert.deepEqual(warnings, []);
  assert.deepEqual(result.board.players.p1.deck.map(({ instanceId }) => instanceId), ["p1-d2"]);
  assert.deepEqual(result.board.players.p1.hand.map(({ instanceId }) => instanceId), ["p1-h1", "p1-d1"]);
});

test("empty deck preserves Legacy behavior without throwing", () => {
  const input = fixture([]);
  const result = runDrawProductionShadow(input, "p1");

  assert.strictEqual(result.board, input);
  assert.equal(result.status, "STRICT_MATCH");
});

test("production Shadow preserves the other player, other zones, and board metadata", () => {
  const input = fixture();
  const result = runDrawProductionShadow(input, "p1");

  assert.strictEqual(result.board.players.p2, input.players.p2);
  assert.deepEqual(result.board.players.p2, input.players.p2);
  for (const zone of unchangedZones) {
    assert.strictEqual(result.board.players.p1[zone], input.players.p1[zone]);
    assert.deepEqual(result.board.players.p1[zone], input.players.p1[zone]);
  }
  for (const field of unchangedMetadata) {
    assert.strictEqual(result.board[field], input[field]);
    assert.deepEqual(result.board[field], input[field]);
  }
});

test("Shadow failure warns safely and still returns the Legacy result", () => {
  const input = fixture();
  const legacy = drawRandomCard(input, "p1");
  const warnings = [];
  const result = runDrawProductionShadow(input, "p1", {
    shadowRunner: () => { throw new Error("secret card contents"); },
    warn: (...args) => warnings.push(args),
  });

  assert.deepEqual(result.board, legacy);
  assert.equal(result.status, "UNDETERMINED");
  assert.deepEqual(warnings, [[
    "[rule-shadow][DRAW] shadow calculation failed",
    { player: "p1", status: "UNDETERMINED" },
  ]]);
  assert.equal(JSON.stringify(warnings).includes("secret card contents"), false);
});

test("non-strict Shadow status warns without changing Legacy authority", () => {
  const input = fixture();
  const legacy = drawRandomCard(input, "p1");
  const warnings = [];
  const result = runDrawProductionShadow(input, "p1", {
    shadowRunner: () => "MISMATCH",
    warn: (...args) => warnings.push(args),
  });

  assert.deepEqual(result.board, legacy);
  assert.equal(result.status, "MISMATCH");
  assert.deepEqual(warnings, [[
    "[rule-shadow][DRAW] comparison did not strictly match",
    { player: "p1", status: "MISMATCH" },
  ]]);
});

test("logging failure cannot fail the Production DRAW", () => {
  const input = fixture();
  const legacy = drawRandomCard(input, "p1");
  const result = runDrawProductionShadow(input, "p1", {
    shadowRunner: () => "MISMATCH",
    warn: () => { throw new Error("logger unavailable"); },
  });

  assert.deepEqual(result.board, legacy);
  assert.equal(result.status, "MISMATCH");
});
