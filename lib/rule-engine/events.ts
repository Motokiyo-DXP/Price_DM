import type { PlayerId } from "./types.ts";

type DrawEventBase = Readonly<{
  player: PlayerId;
  drawIndex: number;
  sourceZone: "deck";
  destinationZone: "hand";
}>;

export type DrawAttemptedEvent = DrawEventBase & Readonly<{
  type: "DRAW_ATTEMPTED";
}>;

export type CardDrawnEvent = DrawEventBase & Readonly<{
  type: "CARD_DRAWN";
  cardInstanceId: string;
}>;

export type DrawFailedNoCardEvent = DrawEventBase & Readonly<{
  type: "DRAW_FAILED_NO_CARD";
}>;

type DiscardEventBase = Readonly<{
  player: PlayerId;
  cardInstanceId: string;
  sourceZone: "hand";
  proposedDestinationZone: "graveyard";
  reason: "DISCARD";
}>;

export type DiscardAttemptedEvent = DiscardEventBase & Readonly<{
  type: "DISCARD_ATTEMPTED";
}>;

export type CardDiscardedEvent = DiscardEventBase & Readonly<{
  type: "CARD_DISCARDED";
  finalDestinationZone: "graveyard";
}>;

export type RuleEvent =
  | DrawAttemptedEvent
  | CardDrawnEvent
  | DrawFailedNoCardEvent
  | DiscardAttemptedEvent
  | CardDiscardedEvent;
