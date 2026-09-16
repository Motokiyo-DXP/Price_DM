import type { PlayerId, RuleCause } from "./types.ts";

export type DrawAction = Readonly<{
  type: "DRAW";
  actor: PlayerId;
  count: number;
  cause: RuleCause;
}>;

export type DiscardAction = Readonly<{
  type: "DISCARD";
  actor: PlayerId;
  cardInstanceId: string;
  cause: RuleCause;
}>;

export type TapAction = Readonly<{
  type: "TAP";
  actor: PlayerId;
  cardInstanceId: string;
  zone: "mana";
  cause: RuleCause;
}>;

export type RuleAction = DrawAction | DiscardAction | TapAction;
