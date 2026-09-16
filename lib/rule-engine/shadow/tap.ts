import { toggleLegacyCardTapState, type BoardState, type PlayerId } from "../../playfield-board.ts";
import type { PlayZone } from "../../playfield-interactions.ts";
import {
  applyTapResolutionToLegacyBoard,
  compareLegacyTapBoards,
  projectLegacyBoardForTap,
  type TapShadowStatus,
} from "../adapters/legacy-board.ts";
import { resolveRuleAction } from "../engine.ts";

type LegacyTapOptions = Readonly<{ clearKeepTappedOnUntap: boolean }>;
type TapShadowRunner = (current: BoardState, owner: PlayerId, cardId: string, legacyBoard: BoardState) => TapShadowStatus;
type TapShadowWarning = (message: string, details: Readonly<{ player: PlayerId; status: TapShadowStatus }>) => void;

type TapProductionShadowOptions = Readonly<{
  shadowRunner?: TapShadowRunner;
  warn?: TapShadowWarning;
}>;

export type TapProductionShadowResult = Readonly<{ board: BoardState; status: TapShadowStatus }>;

function warnSafely(warn: TapShadowWarning, message: string, player: PlayerId, status: TapShadowStatus): void {
  try {
    warn(message, { player, status });
  } catch {
    // Logging must never affect the Production TAP result.
  }
}

function calculateTapShadowStatus(current: BoardState, owner: PlayerId, cardId: string, legacyBoard: BoardState): TapShadowStatus {
  const resolution = resolveRuleAction(projectLegacyBoardForTap(current), {
    type: "TAP",
    actor: owner,
    cardInstanceId: cardId,
    zone: "mana",
    cause: { type: "MANUAL" },
  });
  const shadowBoard = applyTapResolutionToLegacyBoard(current, resolution);
  return compareLegacyTapBoards(legacyBoard, shadowBoard, owner);
}

/** Called only for an existing, untapped mana card selected for a single-card TAP. */
export function runTapProductionShadow(
  current: BoardState,
  owner: PlayerId,
  cardId: string,
  legacyOptions: LegacyTapOptions,
  options: TapProductionShadowOptions = {},
): TapProductionShadowResult {
  const legacyBoard = toggleLegacyCardTapState(current, owner, "mana", cardId, legacyOptions);
  const warn = options.warn ?? console.warn;

  try {
    const status = (options.shadowRunner ?? calculateTapShadowStatus)(current, owner, cardId, legacyBoard);
    if (status === "MISMATCH" || status === "UNDETERMINED") {
      warnSafely(warn, "[rule-shadow][TAP] comparison did not strictly match", owner, status);
    }
    return { board: legacyBoard, status };
  } catch {
    const status = "UNDETERMINED";
    warnSafely(warn, "[rule-shadow][TAP] shadow calculation failed", owner, status);
    return { board: legacyBoard, status };
  }
}

/** Routes only an explicit single-card false-to-true mana toggle through Shadow. */
export function toggleCardTapWithProductionShadow(
  current: BoardState,
  owner: PlayerId,
  zone: PlayZone,
  cardId: string,
  legacyOptions: LegacyTapOptions,
  shadowOptions: TapProductionShadowOptions = {},
): BoardState {
  if (zone === "mana" && current.players[owner].mana.some((card) => card.instanceId === cardId && !card.tapped)) {
    return runTapProductionShadow(current, owner, cardId, legacyOptions, shadowOptions).board;
  }
  return toggleLegacyCardTapState(current, owner, zone, cardId, legacyOptions);
}
