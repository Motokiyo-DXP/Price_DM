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

export type RuleEvent =
  | DrawAttemptedEvent
  | CardDrawnEvent
  | DrawFailedNoCardEvent;
