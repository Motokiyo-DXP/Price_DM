import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuleAction } from "./engine.ts";
const card = (instanceId, civilizations = ["fire"]) => ({ instanceId,
  payload: { civilizations: ["water", "nature"] }, characteristics: { civilizations } });
const zones = (p) => ({ deck: [card(`${p}d`)], hand: [card(`${p}a`), card(`${p}b`), card(`${p}c`)],
  graveyard: [card(`${p}g`)], mana: [{ card: card(`${p}m1`), tapped: true }, { card: card(`${p}m2`), tapped: false }] });
const fixture = () => ({ players: { p1: zones("p1"), p2: zones("p2") } });
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
for (const actor of ["p1", "p2"]) for (const [civilizations, tapped] of [[["fire"], false], [["fire", "water"], true], [["zero"], false]]) {
  test(`${actor} immutable deterministic CHARGE ${civilizations} preserves identity, order and isolation`, () => {
    const input = fixture();
    input.players[actor].hand[1] = card(`${actor}b`, civilizations);
    const before = structuredClone(input);
    freeze(input);
    const action = freeze({ type: "CHARGE", actor, cardInstanceId: `${actor}b`, cause: { type: "RULE_EFFECT", sourceId: "test" } });
    const result = resolveRuleAction(input, action);
    const player = result.state.players[actor];
    assert.deepEqual(player.hand, [input.players[actor].hand[0], input.players[actor].hand[2]]);
    assert.strictEqual(player.mana.at(-1).card, input.players[actor].hand[1]);
    assert.equal(player.mana.at(-1).tapped, tapped);
    assert.equal(player.mana.length, 3);
    input.players[actor].mana.forEach((entry, i) => assert.strictEqual(player.mana[i], entry));
    for (const zone of ["deck", "graveyard"]) assert.strictEqual(player[zone], input.players[actor][zone]);
    assert.strictEqual(result.state.players[actor === "p1" ? "p2" : "p1"], input.players[actor === "p1" ? "p2" : "p1"]);
    assert.deepEqual(input, before);
    assert.deepEqual(resolveRuleAction(input, action), result);
    assert.strictEqual(result.action, action);
    assert.equal(result.status, "RESOLVED");
    assert.deepEqual(result.unsupported, []);
    const base = { player: actor, cardInstanceId: `${actor}b`, sourceZone: "hand", proposedDestinationZone: "mana", reason: "CHARGE" };
    assert.deepEqual(result.events, [{ type: "CHARGE_ATTEMPTED", ...base },
      { type: "CARD_CHARGED", ...base, finalDestinationZone: "mana", entryTapped: tapped }]);
  });
}
for (const civilizations of [undefined, [], ["unknown"], ["fire", "unknown"], ["zero", "fire"]]) {
  test(`CHARGE Core rejects unknown characteristics ${JSON.stringify(civilizations)} before events`, () => {
    const input = fixture();
    input.players.p1.hand[1].characteristics = civilizations === undefined ? undefined : { civilizations };
    const before = structuredClone(input);
    assert.throws(() => resolveRuleAction(freeze(input), { type: "CHARGE", actor: "p1", cardInstanceId: "p1b" }), /CHARGE precondition failed/);
    assert.deepEqual(input, before);
  });
}
for (const cardInstanceId of ["missing", "p2b", "p1m1", "p1d"]) test(`CHARGE rejects invalid hand ID ${cardInstanceId}`, () => {
  assert.throws(() => resolveRuleAction(freeze(fixture()), { type: "CHARGE", actor: "p1", cardInstanceId }), /not in actor's hand/);
});
