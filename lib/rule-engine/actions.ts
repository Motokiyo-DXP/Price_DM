import type { PlayerId, RuleCause } from "./types.ts";

export type DrawAction = Readonly<{
  type: "DRAW";
  actor: PlayerId;
  count: number;
  cause: RuleCause;
}>;

export type RuleAction = DrawAction;
