import type { DiscardAction, DrawAction, RuleAction, TapAction } from "./actions.ts";
import type { RuleEvent } from "./events.ts";
import { drawOne } from "./primitives/draw.ts";
import { discardOne } from "./primitives/discard.ts";
import { tapOne } from "./primitives/tap.ts";
import type { ResolutionStatus, RuleState, UnsupportedCapability } from "./types.ts";

export type RuleResolution<TPayload> = Readonly<{
  action: RuleAction;
  state: RuleState<TPayload>;
  events: readonly RuleEvent[];
  status: ResolutionStatus;
  unsupported: readonly UnsupportedCapability[];
}>;

function resolveDraw<TPayload>(
  input: RuleState<TPayload>,
  action: DrawAction,
): RuleResolution<TPayload> {
  if (!Number.isSafeInteger(action.count) || action.count < 1) {
    throw new RangeError("DRAW count must be a positive safe integer.");
  }

  let state = input;
  const events: RuleEvent[] = [];
  for (let drawIndex = 1; drawIndex <= action.count; drawIndex += 1) {
    const result = drawOne(state, action.actor, drawIndex);
    state = result.state;
    events.push(...result.events);
  }

  return {
    action,
    state,
    events,
    status: "RESOLVED",
    unsupported: [],
  };
}

function resolveDiscard<TPayload>(
  input: RuleState<TPayload>,
  action: DiscardAction,
): RuleResolution<TPayload> {
  const result = discardOne(input, action);
  return { action, ...result, status: "RESOLVED", unsupported: [] };
}

function resolveTap<TPayload>(input: RuleState<TPayload>, action: TapAction): RuleResolution<TPayload> {
  const result = tapOne(input, action);
  return { action, ...result, status: "RESOLVED", unsupported: [] };
}

export function resolveRuleAction<TPayload>(
  input: RuleState<TPayload>,
  action: RuleAction,
): RuleResolution<TPayload> {
  switch (action.type) {
    case "DRAW":
      return resolveDraw(input, action);
    case "DISCARD":
      return resolveDiscard(input, action);
    case "TAP":
      return resolveTap(input, action);
  }
}
