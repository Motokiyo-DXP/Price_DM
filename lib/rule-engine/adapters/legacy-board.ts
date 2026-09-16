import type { DiscardAction, DrawAction, TapAction } from "../actions.ts";
import type { RuleResolution } from "../engine.ts";
import type { RuleState } from "../types.ts";
import type { BoardState, CardInstance, PlayerId } from "../../playfield-board.ts";

export type DrawShadowStatus =
  | "STRICT_MATCH"
  | "SEMANTIC_MATCH"
  | "POLICY_ACCEPTABLE"
  | "MISMATCH"
  | "UNDETERMINED";

export type DiscardShadowStatus = DrawShadowStatus;
export type TapShadowStatus = DrawShadowStatus;

export function projectLegacyBoardForDraw(
  board: BoardState,
): RuleState<CardInstance> {
  const projectPlayer = (player: PlayerId) => ({
    deck: board.players[player].deck.map((card) => ({ instanceId: card.instanceId, payload: card })),
    hand: board.players[player].hand.map((card) => ({ instanceId: card.instanceId, payload: card })),
    graveyard: board.players[player].graveyard.map((card) => ({ instanceId: card.instanceId, payload: card })),
    mana: board.players[player].mana.map((card) => ({
      card: { instanceId: card.instanceId, payload: card },
      tapped: card.tapped,
    })),
  });
  return { players: { p1: projectPlayer("p1"), p2: projectPlayer("p2") } };
}

export function projectLegacyBoardForDiscard(board: BoardState): RuleState<CardInstance> {
  return projectLegacyBoardForDraw(board);
}

export function projectLegacyBoardForTap(board: BoardState): RuleState<CardInstance> {
  return projectLegacyBoardForDraw(board);
}

export function applyTapResolutionToLegacyBoard(
  board: BoardState,
  resolution: RuleResolution<CardInstance>,
): BoardState {
  const action = resolution.action as TapAction;
  const player = action.actor;
  return {
    ...board,
    players: {
      ...board.players,
      [player]: {
        ...board.players[player],
        mana: resolution.state.players[player].mana.map((entry) => entry.tapped === entry.card.payload.tapped
          ? entry.card.payload
          : { ...entry.card.payload, tapped: entry.tapped }),
      },
    },
  };
}

export function compareLegacyTapBoards(
  legacy: BoardState,
  shadow: BoardState,
  player: PlayerId,
): TapShadowStatus {
  const project = (board: BoardState) => ({
    mana: board.players[player].mana.map((card) => ({
      instanceId: card.instanceId,
      tapped: card.tapped,
      face: card.face,
      markers: card.markers,
      shieldMarker: card.shieldMarker,
      stackId: card.stackId,
      stackOrder: card.stackOrder,
      stackLayout: card.stackLayout,
      stackPlacement: card.stackPlacement,
      attachedToStackId: card.attachedToStackId,
    })),
  });
  return JSON.stringify(project(legacy)) === JSON.stringify(project(shadow)) ? "STRICT_MATCH" : "MISMATCH";
}

export function applyDiscardResolutionToLegacyBoard(
  board: BoardState,
  resolution: RuleResolution<CardInstance>,
): BoardState {
  const action = resolution.action as DiscardAction;
  const player = action.actor;
  const projected = resolution.state.players[player];
  const originalGraveyardLength = board.players[player].graveyard.length;
  return {
    ...board,
    players: {
      ...board.players,
      [player]: {
        ...board.players[player],
        hand: projected.hand.map((card) => card.payload),
        graveyard: projected.graveyard.map((card, index) => index < originalGraveyardLength
          ? card.payload
          : {
              ...card.payload,
              face: "face_up" as const,
              tapped: false,
              shieldMarker: null,
              markers: [],
              stackId: null,
              stackOrder: null,
              stackLayout: null,
              stackPlacement: null,
              attachedToStackId: null,
            }),
      },
    },
  };
}

export function compareLegacyDiscardBoards(
  legacy: BoardState,
  shadow: BoardState,
  player: PlayerId,
): DiscardShadowStatus {
  const project = (board: BoardState) => ({
    hand: board.players[player].hand.map((card) => card.instanceId),
    graveyard: board.players[player].graveyard.map((card) => ({
      instanceId: card.instanceId,
      face: card.face,
      tapped: card.tapped,
      shieldMarker: card.shieldMarker,
      markers: card.markers,
      stackId: card.stackId,
      stackOrder: card.stackOrder,
      stackLayout: card.stackLayout,
      stackPlacement: card.stackPlacement,
      attachedToStackId: card.attachedToStackId,
    })),
  });
  return JSON.stringify(project(legacy)) === JSON.stringify(project(shadow)) ? "STRICT_MATCH" : "MISMATCH";
}

export function applyDrawResolutionToLegacyBoard(
  board: BoardState,
  resolution: RuleResolution<CardInstance>,
): BoardState {
  const action = resolution.action as DrawAction;
  const player = action.actor;
  const originalHandIds = new Set(board.players[player].hand.map((card) => card.instanceId));
  const projected = resolution.state.players[player];

  return {
    ...board,
    players: {
      ...board.players,
      [player]: {
        ...board.players[player],
        deck: projected.deck.map((card) => card.payload),
        hand: projected.hand.map((card) => originalHandIds.has(card.instanceId)
          ? card.payload
          : { ...card.payload, face: "owner_only", tapped: false, shieldMarker: null }),
      },
    },
  };
}

export function compareLegacyDrawBoards(
  legacy: BoardState,
  shadow: BoardState,
  player: PlayerId,
): DrawShadowStatus {
  const project = (board: BoardState) => ({
    deck: board.players[player].deck.map((card) => card.instanceId),
    hand: board.players[player].hand.map((card) => ({
      instanceId: card.instanceId,
      face: card.face,
      tapped: card.tapped,
      shieldMarker: card.shieldMarker,
    })),
  });
  return JSON.stringify(project(legacy)) === JSON.stringify(project(shadow))
    ? "STRICT_MATCH"
    : "MISMATCH";
}
