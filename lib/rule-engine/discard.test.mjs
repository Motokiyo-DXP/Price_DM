import assert from "node:assert/strict";
import test from "node:test";

import { resolveRuleAction } from "./engine.ts";

// Evidence: DISCARD-001, DISCARD-003; selection exceptions in DISCARD-002 are deferred.
const card = (instanceId) => ({ instanceId, payload: { label: instanceId } });
const fixture = () => ({ players: {
  p1: { deck: [card("d1")], hand: [card("h1"), card("h2"), card("h3")], graveyard: [card("g1")] },
  p2: { deck: [card("p2d1")], hand: [card("p2h1")], graveyard: [card("p2g1")] },
} });
const action = { type: "DISCARD", actor: "p1", cardInstanceId: "h2", cause: { type: "MANUAL" } };

test("DISCARD moves only the selected card to graveyard tail and preserves identity [DISCARD-001]", () => {
  const input = fixture();
  const result = resolveRuleAction(input, action);
  assert.deepEqual(result.state.players.p1.hand.map((c) => c.instanceId), ["h1", "h3"]);
  assert.deepEqual(result.state.players.p1.graveyard.map((c) => c.instanceId), ["g1", "h2"]);
  assert.strictEqual(result.state.players.p1.graveyard[1], input.players.p1.hand[1]);
  assert.strictEqual(result.state.players.p1.deck, input.players.p1.deck);
  assert.strictEqual(result.state.players.p2, input.players.p2);
  assert.equal(result.status, "RESOLVED");
  assert.deepEqual(result.unsupported, []);
});

test("DISCARD events retain the attempted/result move semantics", () => {
  const result = resolveRuleAction(fixture(), action);
  assert.deepEqual(result.events.map((event) => event.type), ["DISCARD_ATTEMPTED", "CARD_DISCARDED"]);
  for (const event of result.events) {
    assert.equal(event.player, "p1");
    assert.equal(event.cardInstanceId, "h2");
    assert.equal(event.sourceZone, "hand");
    assert.equal(event.proposedDestinationZone, "graveyard");
    assert.equal(event.finalDestinationZone, "graveyard");
    assert.equal(event.reason, "DISCARD");
  }
});

test("DISCARD is immutable and deterministic", () => {
  const input = fixture();
  const before = structuredClone(input);
  const first = resolveRuleAction(input, action);
  const second = resolveRuleAction(input, action);
  assert.deepEqual(input, before);
  assert.deepEqual(first.state, second.state);
  assert.deepEqual(first.events, second.events);
});

test("a missing hand card is an internal precondition failure, not a Rule event", () => {
  assert.throws(() => resolveRuleAction(fixture(), { ...action, cardInstanceId: "missing" }), /DISCARD precondition failed/);
});
