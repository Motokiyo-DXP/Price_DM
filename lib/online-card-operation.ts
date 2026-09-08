export type RemoteCardOperation = {
  active: boolean;
  cardId: string;
  displayName: string;
  player: "p1" | "p2";
  userId: string;
};

export function parseRemoteCardOperation(payload: unknown, currentUserId: string): RemoteCardOperation | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (value.userId === currentUserId) return null;
  if (typeof value.userId !== "string" || typeof value.cardId !== "string" || typeof value.displayName !== "string") return null;
  if (value.player !== "p1" && value.player !== "p2") return null;
  if (typeof value.active !== "boolean") return null;
  return {
    active: value.active,
    cardId: value.cardId,
    displayName: value.displayName.slice(0, 40),
    player: value.player,
    userId: value.userId,
  };
}
