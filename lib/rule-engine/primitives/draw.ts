import type { RuleEvent } from "../events.ts";
import type { PlayerId, RuleState } from "../types.ts";

export type SingleDrawResult<TPayload> = Readonly<{
  state: RuleState<TPayload>;
  events: readonly RuleEvent[];
}>;

export function drawOne<TPayload>(
  input: RuleState<TPayload>,
  player: PlayerId,
  drawIndex: number,
): SingleDrawResult<TPayload> {
  const attempted = {
    type: "DRAW_ATTEMPTED" as const,
    player,
    drawIndex,
    sourceZone: "deck" as const,
    destinationZone: "hand" as const,
  };
  const card = input.players[player].deck[0];

  if (!card) {
    return {
      state: input,
      events: [attempted, {
        type: "DRAW_FAILED_NO_CARD",
        player,
        drawIndex,
        sourceZone: "deck",
        destinationZone: "hand",
      }],
    };
  }

  return {
    state: {
      ...input,
      players: {
        ...input.players,
        [player]: {
          deck: input.players[player].deck.slice(1),
          hand: [...input.players[player].hand, card],
        },
      },
    },
    events: [attempted, {
      type: "CARD_DRAWN",
      player,
      drawIndex,
      cardInstanceId: card.instanceId,
      sourceZone: "deck",
      destinationZone: "hand",
    }],
  };
}
