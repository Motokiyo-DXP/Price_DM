// Test-only seam. Generic manual hand -> mana moves do not imply CHARGE intent.
import type { BoardState, CardInstance } from "../../playfield-board.ts";
import { resolveCardCivilizations } from "../../playfield-board.ts";
import type { ChargeAction } from "../actions.ts";
import type { Civilization, RuleState } from "../types.ts";
import { projectLegacyBoardForDraw } from "./legacy-board.ts";
import { resolveRuleAction } from "../engine.ts";

export function projectLegacyBoardForCharge(board: BoardState, action: ChargeAction): RuleState<CardInstance> {
  const state = projectLegacyBoardForDraw(board);
  const player = state.players[action.actor];
  const selected = player.hand.find((card) => card.instanceId === action.cardInstanceId);
  if (!selected) throw new RangeError("CHARGE precondition failed: card is not in actor's hand.");
  const raw = selected.payload.civilizations;
  // Empty arrays may result from missing canonical metadata; only explicit zero confirms colorless.
  const civilizations = resolveCardCivilizations(selected.payload.name, raw);
  if (!raw?.length || !civilizations.length || raw.some((value) =>
    !civilizations.includes(value.trim().toLowerCase()))
    || (civilizations.includes("zero") && civilizations.length !== 1)) {
    throw new RangeError("CHARGE projection failed: missing or unknown civilization metadata.");
  }
  return { ...state, players: { ...state.players, [action.actor]: {
    ...player, hand: player.hand.map((card) => card === selected
      ? { ...card, characteristics: { civilizations: civilizations as Civilization[] } } : card),
  } } };
}

// Presentation/stack fields are Legacy-owned. Retain semantic identity, order, and mana tap state.
function normalizeCard(card: CardInstance) {
  const { face, tapped, markers, shieldMarker, stackId, stackOrder, stackLayout,
    stackPlacement, attachedToStackId, ...semantic } = card;
  void face; void tapped; void markers; void shieldMarker; void stackId; void stackOrder;
  void stackLayout; void stackPlacement; void attachedToStackId;
  return semantic;
}

export function compareLegacyChargeResult(legacy: BoardState, input: BoardState,
  resolution: ReturnType<typeof resolveRuleAction<CardInstance>>): "STRICT_MATCH" | "MISMATCH" {
  const action = resolution.action as ChargeAction;
  const player = action.actor;
  const projected = resolution.state.players[player];
  const normalizePlayer = (board: BoardState, owner: "p1" | "p2") => ({
    ...board.players[owner],
    hand: board.players[owner].hand.map(normalizeCard),
    mana: board.players[owner].mana.map((card) => ({ card: normalizeCard(card), tapped: card.tapped })),
  });
  const normalize = (board: BoardState) => ({ ...board, untouchedPlayer: board.players[player === "p1" ? "p2" : "p1"], players: {
    p1: normalizePlayer(board, "p1"), p2: normalizePlayer(board, "p2"),
  } });
  const shadow = normalize(input);
  shadow.players[player].hand = projected.hand.map((card) => normalizeCard(card.payload));
  shadow.players[player].mana = projected.mana.map((entry) => ({ card: normalizeCard(entry.card.payload), tapped: entry.tapped }));
  return JSON.stringify(normalize(legacy)) === JSON.stringify(shadow) ? "STRICT_MATCH" : "MISMATCH";
}
