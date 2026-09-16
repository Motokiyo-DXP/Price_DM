import type { DiscardAction } from "../actions.ts";
import type { CardDiscardedEvent, DiscardAttemptedEvent } from "../events.ts";
import type { RuleState } from "../types.ts";

export function discardOne<TPayload>(
  input: RuleState<TPayload>,
  action: DiscardAction,
): Readonly<{
  state: RuleState<TPayload>;
  events: readonly [DiscardAttemptedEvent, CardDiscardedEvent];
}> {
  const player = input.players[action.actor];
  const index = player.hand.findIndex((card) => card.instanceId === action.cardInstanceId);
  if (index < 0) throw new RangeError("DISCARD precondition failed: card is not in actor's hand.");

  const card = player.hand[index];
  return {
    state: {
      ...input,
      players: {
        ...input.players,
        [action.actor]: {
          ...player,
          hand: [...player.hand.slice(0, index), ...player.hand.slice(index + 1)],
          graveyard: [...player.graveyard, card],
        },
      },
    },
    events: [{
      type: "DISCARD_ATTEMPTED",
      player: action.actor,
      cardInstanceId: action.cardInstanceId,
      sourceZone: "hand",
      proposedDestinationZone: "graveyard",
      reason: "DISCARD",
    }, {
      type: "CARD_DISCARDED",
      player: action.actor,
      cardInstanceId: action.cardInstanceId,
      sourceZone: "hand",
      proposedDestinationZone: "graveyard",
      finalDestinationZone: "graveyard",
      reason: "DISCARD",
    }],
  };
}
