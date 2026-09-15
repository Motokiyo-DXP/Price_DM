import type { DrawAction } from "../actions.ts";
import type { RuleResolution } from "../engine.ts";
import type { RuleState } from "../types.ts";
import type { BoardState, CardInstance, PlayerId } from "../../playfield-board.ts";

export type DrawShadowStatus =
  | "STRICT_MATCH"
  | "SEMANTIC_MATCH"
  | "POLICY_ACCEPTABLE"
  | "MISMATCH"
  | "UNDETERMINED";

export function projectLegacyBoardForDraw(
  board: BoardState,
): RuleState<CardInstance> {
  const projectPlayer = (player: PlayerId) => ({
    deck: board.players[player].deck.map((card) => ({ instanceId: card.instanceId, payload: card })),
    hand: board.players[player].hand.map((card) => ({ instanceId: card.instanceId, payload: card })),
  });
  return { players: { p1: projectPlayer("p1"), p2: projectPlayer("p2") } };
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
