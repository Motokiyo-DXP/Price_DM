import type { ChargeAction } from "../actions.ts";
import type { CardChargedEvent, ChargeAttemptedEvent } from "../events.ts";
import type { RuleState } from "../types.ts";

export function chargeOne<TPayload>(
  input: RuleState<TPayload>,
  action: ChargeAction,
): Readonly<{
  state: RuleState<TPayload>;
  events: readonly [ChargeAttemptedEvent, CardChargedEvent];
}> {
  const player = input.players[action.actor];
  const index = player.hand.findIndex((card) => card.instanceId === action.cardInstanceId);
  if (index < 0) throw new RangeError("CHARGE precondition failed: card is not in actor's hand.");

  const card = player.hand[index];
  const civilizations = card.characteristics?.civilizations;
  const known = new Set(["light", "water", "darkness", "fire", "nature", "zero"]);
  if (!civilizations?.length || civilizations.some((value) => !known.has(value))
    || (civilizations.includes("zero") && civilizations.some((value) => value !== "zero"))) {
    throw new RangeError("CHARGE precondition failed: missing or unknown civilization characteristics.");
  }
  const entryTapped = new Set(civilizations).size > 1;
  return {
    state: {
      ...input,
      players: {
        ...input.players,
        [action.actor]: {
          ...player,
          hand: [...player.hand.slice(0, index), ...player.hand.slice(index + 1)],
          mana: [...player.mana, { card, tapped: entryTapped }],
        },
      },
    },
    events: [{
      type: "CHARGE_ATTEMPTED",
      player: action.actor,
      cardInstanceId: action.cardInstanceId,
      sourceZone: "hand",
      proposedDestinationZone: "mana",
      reason: "CHARGE",
    }, {
      type: "CARD_CHARGED",
      player: action.actor,
      cardInstanceId: action.cardInstanceId,
      sourceZone: "hand",
      proposedDestinationZone: "mana",
      finalDestinationZone: "mana",
      entryTapped,
      reason: "CHARGE",
    }],
  };
}
