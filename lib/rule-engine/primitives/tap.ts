import type { TapAction } from "../actions.ts";
import type { CardTappedEvent, TapAttemptedEvent, TapNoStateChangeAlreadyTappedEvent } from "../events.ts";
import type { RuleState } from "../types.ts";

export function tapOne<TPayload>(
  input: RuleState<TPayload>,
  action: TapAction,
): Readonly<{
  state: RuleState<TPayload>;
  events: readonly [TapAttemptedEvent, CardTappedEvent | TapNoStateChangeAlreadyTappedEvent];
}> {
  const player = input.players[action.actor];
  const index = player.mana.findIndex((entry) => entry.card.instanceId === action.cardInstanceId);
  if (index < 0) throw new RangeError("TAP precondition failed: card is not in actor's mana.");

  const event = { player: action.actor, cardInstanceId: action.cardInstanceId, zone: "mana" as const };
  const attempted = { type: "TAP_ATTEMPTED" as const, ...event };
  if (player.mana[index].tapped) {
    return { state: input, events: [attempted, { type: "TAP_NO_STATE_CHANGE_ALREADY_TAPPED", ...event }] };
  }

  const mana = player.mana.slice();
  mana[index] = { ...mana[index], tapped: true };
  return {
    state: {
      ...input,
      players: { ...input.players, [action.actor]: { ...player, mana } },
    },
    events: [attempted, { type: "CARD_TAPPED", ...event }],
  };
}
