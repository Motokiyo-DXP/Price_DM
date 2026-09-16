import assert from "node:assert/strict";
import test from "node:test";

import { resolveRuleAction } from "./engine.ts";

// Evidence: DRAW-001, DRAW-002, DRAW-003, DRAW-004, DRAW-005, DRAW-006.
const card = (instanceId) => ({ instanceId, payload: { label: instanceId } });
const makeState = (deck = [card("d1"), card("d2"), card("d3")]) => ({
  players: {
    p1: { deck, hand: [card("h1")], graveyard: [card("g1")], mana: [{ card: card("m1"), tapped: false }] },
    p2: { deck: [card("p2-d1")], hand: [card("p2-h1")], graveyard: [], mana: [] },
  },
});
const draw = (state, count = 1) => resolveRuleAction(state, {
  type: "DRAW",
  actor: "p1",
  count,
  cause: { type: "MANUAL" },
});

test("normal DRAW moves the top card with its identity and emits semantic events [DRAW-001]", () => {
  const input = makeState();
  const result = draw(input);
  assert.deepEqual(result.state.players.p1.deck.map(({ instanceId }) => instanceId), ["d2", "d3"]);
  assert.deepEqual(result.state.players.p1.hand.map(({ instanceId }) => instanceId), ["h1", "d1"]);
  assert.strictEqual(result.state.players.p1.hand.at(-1), input.players.p1.deck[0]);
  assert.deepEqual(result.events.map(({ type }) => type), ["DRAW_ATTEMPTED", "CARD_DRAWN"]);
  assert.equal(result.events[1].cardInstanceId, "d1");
  assert.equal(result.status, "RESOLVED");
});

test("empty deck records the attempt and failure without changing state [DRAW-005, DRAW-006]", () => {
  const input = makeState([]);
  const result = draw(input);
  assert.strictEqual(result.state, input);
  assert.deepEqual(result.events.map(({ type }) => type), ["DRAW_ATTEMPTED", "DRAW_FAILED_NO_CARD"]);
});

test("DRAW two resolves as two ordered single-card attempts [DRAW-002]", () => {
  const result = draw(makeState(), 2);
  assert.deepEqual(result.events.map(({ type }) => type), [
    "DRAW_ATTEMPTED", "CARD_DRAWN", "DRAW_ATTEMPTED", "CARD_DRAWN",
  ]);
  assert.deepEqual(result.events.filter(({ type }) => type === "CARD_DRAWN").map(({ cardInstanceId }) => cardInstanceId), ["d1", "d2"]);
  assert.deepEqual(result.state.players.p1.deck.map(({ instanceId }) => instanceId), ["d3"]);
  assert.deepEqual(result.state.players.p1.hand.map(({ instanceId }) => instanceId), ["h1", "d1", "d2"]);
});

test("DRAW never mutates the input graph", () => {
  const input = makeState();
  const before = structuredClone(input);
  draw(input, 2);
  assert.deepEqual(input, before);
});

test("p1 DRAW leaves p2 state isolated", () => {
  const input = makeState();
  const result = draw(input);
  assert.strictEqual(result.state.players.p2, input.players.p2);
  assert.deepEqual(result.state.players.p2, input.players.p2);
});

test("DRAW is deterministic and does not reorder the remaining deck", () => {
  const input = makeState();
  assert.deepEqual(draw(input).state.players.p1.deck, input.players.p1.deck.slice(1));
  assert.deepEqual(draw(input, 2).state, draw(input, 2).state);
});

test("DRAW preserves the existing graveyard", () => {
  const input = makeState();
  const result = draw(input);
  assert.strictEqual(result.state.players.p1.graveyard, input.players.p1.graveyard);
});

test("DRAW preserves mana unchanged", () => {
  const input = makeState();
  assert.strictEqual(draw(input).state.players.p1.mana, input.players.p1.mana);
});
