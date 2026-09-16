import assert from "node:assert/strict";
import test from "node:test";

import { resolveRuleAction } from "./engine.ts";

// Evidence: TAP-001, TAP-002, TAP-003 in TAP_BASE_2026_09_16.
const card = (instanceId) => ({ instanceId, payload: { label: instanceId } });
const entry = (instanceId, tapped = false) => ({ card: card(instanceId), tapped });
const fixture = () => ({ players: {
  p1: {
    deck: [card("d1")], hand: [card("h1")], graveyard: [card("g1")],
    mana: [entry("m1"), entry("m2"), entry("m3")],
  },
  p2: { deck: [card("p2d1")], hand: [card("p2h1")], graveyard: [], mana: [entry("p2m1")] },
} });
const action = { type: "TAP", actor: "p1", cardInstanceId: "m2", zone: "mana", cause: { type: "MANUAL" } };

test("normal TAP changes only the middle mana wrapper and preserves identity and order [TAP-001, TAP-002]", () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = resolveRuleAction(input, action);
  const previous = input.players.p1;
  const next = result.state.players.p1;

  assert.deepEqual(next.mana.map((item) => item.card.instanceId), ["m1", "m2", "m3"]);
  assert.deepEqual(next.mana.map((item) => item.tapped), [false, true, false]);
  assert.strictEqual(next.mana[1].card, previous.mana[1].card);
  assert.strictEqual(next.mana[0], previous.mana[0]);
  assert.strictEqual(next.mana[2], previous.mana[2]);
  for (const zone of ["deck", "hand", "graveyard"]) assert.strictEqual(next[zone], previous[zone]);
  assert.strictEqual(result.state.players.p2, input.players.p2);
  assert.deepEqual(input, before);
  assert.deepEqual(result.events, [
    { type: "TAP_ATTEMPTED", player: "p1", cardInstanceId: "m2", zone: "mana" },
    { type: "CARD_TAPPED", player: "p1", cardInstanceId: "m2", zone: "mana" },
  ]);
  assert.equal(result.status, "RESOLVED");
  assert.deepEqual(result.unsupported, []);
  const again = resolveRuleAction(input, action);
  assert.deepEqual(result.state, again.state);
  assert.deepEqual(result.events, again.events);
});

test("already-tapped TAP resolves with no state change and no CARD_TAPPED [TAP-003]", () => {
  const input = fixture();
  input.players.p1.mana[1] = entry("m2", true);
  const result = resolveRuleAction(input, action);
  assert.strictEqual(result.state, input);
  assert.deepEqual(result.events.map((event) => event.type), [
    "TAP_ATTEMPTED", "TAP_NO_STATE_CHANGE_ALREADY_TAPPED",
  ]);
  assert.equal(result.status, "RESOLVED");
  assert.deepEqual(result.unsupported, []);
});

test("missing mana ID fails before any Rule Event", () => {
  assert.throws(() => resolveRuleAction(fixture(), { ...action, cardInstanceId: "missing" }),
    { name: "RangeError", message: /TAP precondition failed/ });
});
