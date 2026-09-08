import type { BoardState, CardInstance, PlayerId } from "@/lib/playfield-board";
import type { PlayZone } from "@/lib/playfield-interactions";

const zoneNames: Record<PlayZone, string> = {
  deck: "山札", hand: "手札", shield: "シールド", mana: "マナ", battle: "バトルゾーン",
  graveyard: "墓地", hyperspatial: "超次元", gr: "GR", abyss: "深淵", reveal: "仮置き場",
};

type CardLocation = { card: CardInstance; owner: PlayerId; position: number; zone: PlayZone };

function flattenBoard(board: BoardState) {
  const cards = new Map<string, CardLocation>();
  for (const owner of ["p1", "p2"] as const) {
    for (const [zone, zoneCards] of Object.entries(board.players[owner]) as [PlayZone, CardInstance[]][]) {
      zoneCards.forEach((card, position) => cards.set(card.instanceId, { card, owner, position, zone }));
    }
  }
  return cards;
}

export function describeOpponentBoardChange(before: BoardState, after: BoardState, actorName: string) {
  const safeName = actorName.trim().slice(0, 40) || "対戦相手";
  const beforeCards = flattenBoard(before);
  const afterCards = flattenBoard(after);
  const moved = [...afterCards].flatMap(([id, next]) => {
    const previous = beforeCards.get(id);
    return previous && (previous.owner !== next.owner || previous.zone !== next.zone) ? [{ previous, next }] : [];
  });
  if (moved.length) {
    const sameRoute = moved.every(({ previous, next }) => previous.zone === moved[0].previous.zone && next.zone === moved[0].next.zone);
    return sameRoute
      ? `${safeName}がカード${moved.length > 1 ? `${moved.length}枚` : ""}を${zoneNames[moved[0].previous.zone]}から${zoneNames[moved[0].next.zone]}へ移動しました`
      : `${safeName}がカード${moved.length > 1 ? `${moved.length}枚を` : "を"}移動しました`;
  }

  for (const owner of ["p1", "p2"] as const) {
    for (const [zone, previousCards] of Object.entries(before.players[owner]) as [PlayZone, CardInstance[]][]) {
      const nextCards = after.players[owner][zone];
      if (previousCards.length < 2 || previousCards.length !== nextCards.length || !nextCards.every((card) => card.face === "face_down")) continue;
      const previousIds = previousCards.map((card) => card.instanceId);
      const nextIds = nextCards.map((card) => card.instanceId);
      const sameMembers = previousIds.every((id) => nextIds.includes(id));
      const orderChanged = previousIds.some((id, index) => nextIds[index] !== id);
      if (sameMembers && orderChanged) return `${safeName}が${zoneNames[zone]}をシャッフルしました`;
    }
  }
  return null;
}
