export type PlayerId = "p1" | "p2";

export type RuleCard<TPayload = unknown> = Readonly<{
  instanceId: string;
  payload: TPayload;
}>;

export type RulePlayerState<TPayload = unknown> = Readonly<{
  deck: readonly RuleCard<TPayload>[];
  hand: readonly RuleCard<TPayload>[];
  graveyard: readonly RuleCard<TPayload>[];
}>;

export type RuleState<TPayload = unknown> = Readonly<{
  players: Readonly<Record<PlayerId, RulePlayerState<TPayload>>>;
}>;

export type RuleCause = Readonly<{
  type: "MANUAL" | "RULE_EFFECT";
  sourceId?: string;
}>;

export type ResolutionStatus = "RESOLVED" | "PARTIAL_UNSUPPORTED";

export type UnsupportedCapability =
  | "DRAW_REPLACEMENT"
  | "DRAW_TRIGGER"
  | "STABILIZATION";
