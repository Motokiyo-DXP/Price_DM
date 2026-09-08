import type { BoardState } from "@/lib/playfield-board";

export function resolvePlaytestInitialState(initialState: BoardState, externalState?: BoardState) {
  return externalState ?? initialState;
}
