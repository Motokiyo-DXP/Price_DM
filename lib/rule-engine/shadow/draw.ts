import { drawRandomCard, type BoardState, type PlayerId } from "../../playfield-board.ts";
import {
  applyDrawResolutionToLegacyBoard,
  compareLegacyDrawBoards,
  projectLegacyBoardForDraw,
  type DrawShadowStatus,
} from "../adapters/legacy-board.ts";
import { resolveRuleAction } from "../engine.ts";

export type DrawProductionShadowResult = Readonly<{
  board: BoardState;
  status: DrawShadowStatus;
}>;

type DrawShadowRunner = (
  current: BoardState,
  owner: PlayerId,
  legacyBoard: BoardState,
) => DrawShadowStatus;
type DrawShadowWarning = (
  message: string,
  details: Readonly<{ player: PlayerId; status: DrawShadowStatus }>,
) => void;

type DrawProductionShadowOptions = Readonly<{
  shadowRunner?: DrawShadowRunner;
  warn?: DrawShadowWarning;
}>;

function warnSafely(
  warn: DrawShadowWarning,
  message: string,
  player: PlayerId,
  status: DrawShadowStatus,
): void {
  try {
    warn(message, { player, status });
  } catch {
    // Logging must never affect the Production DRAW result.
  }
}

function calculateDrawShadowStatus(
  current: BoardState,
  owner: PlayerId,
  legacyBoard: BoardState,
): DrawShadowStatus {
  const resolution = resolveRuleAction(projectLegacyBoardForDraw(current), {
    type: "DRAW",
    actor: owner,
    count: 1,
    cause: { type: "MANUAL" },
  });
  const shadowBoard = applyDrawResolutionToLegacyBoard(current, resolution);
  return compareLegacyDrawBoards(legacyBoard, shadowBoard, owner);
}

export function runDrawProductionShadow(
  current: BoardState,
  owner: PlayerId,
  options: DrawProductionShadowOptions = {},
): DrawProductionShadowResult {
  const legacyBoard = drawRandomCard(current, owner);
  const warn = options.warn ?? console.warn;

  try {
    const status = (options.shadowRunner ?? calculateDrawShadowStatus)(current, owner, legacyBoard);
    if (status === "MISMATCH" || status === "UNDETERMINED") {
      warnSafely(warn, "[rule-shadow][DRAW] comparison did not strictly match", owner, status);
    }
    return { board: legacyBoard, status };
  } catch {
    const status = "UNDETERMINED";
    warnSafely(warn, "[rule-shadow][DRAW] shadow calculation failed", owner, status);
    return { board: legacyBoard, status };
  }
}
