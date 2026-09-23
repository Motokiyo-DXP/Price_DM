import type { BoardState } from "@/lib/playfield-board";

export function resolvePlaytestInitialState(initialState: BoardState, externalState?: BoardState) {
  const state = externalState ?? initialState;
  if (state.players.p1.deckInspection && state.players.p2.deckInspection) return state;
  return {
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players.p1, deckInspection: state.players.p1.deckInspection ?? [] },
      p2: { ...state.players.p2, deckInspection: state.players.p2.deckInspection ?? [] },
    },
  };
}
