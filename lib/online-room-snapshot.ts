import type { BoardState } from "@/lib/playfield-board";

export function readNewerRoomSnapshot(
  currentVersion: number,
  snapshot: { state: unknown; state_version: unknown } | null | undefined,
): { state: BoardState; stateVersion: number } | null {
  if (!snapshot || typeof snapshot.state_version !== "number" || snapshot.state_version <= currentVersion) return null;
  if (!snapshot.state || typeof snapshot.state !== "object" || !("players" in snapshot.state)) return null;
  return { state: snapshot.state as BoardState, stateVersion: snapshot.state_version };
}
