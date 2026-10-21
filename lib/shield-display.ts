import type { CardInstance } from "./playfield-board.ts";

// Keep connected stacks together, using the existing root stack as the shield unit.
export function shieldDisplay(cards: CardInstance[]) {
  const stacks = new Map(cards.filter((card) => card.stackId).map((card) => [card.stackId!, card]));
  const unit = (card: CardInstance) => {
    let root = card;
    const visited = new Set<string>();
    while (root.attachedToStackId && stacks.has(root.attachedToStackId) && !visited.has(root.attachedToStackId)) {
      visited.add(root.attachedToStackId);
      root = stacks.get(root.attachedToStackId)!;
    }
    return root.stackId ? `stack:${root.stackId}` : `card:${root.instanceId}`;
  };
  const priorityIds = new Set(cards.filter((card) => card.face === "face_up" || Boolean(card.markers?.length) || Boolean(card.shieldMarker)).map(unit));
  const priority: CardInstance[] = [];
  const normal: CardInstance[] = [];
  for (const card of cards) (priorityIds.has(unit(card)) ? priority : normal).push(card);
  return { cards: [...priority, ...normal], priorityIds };
}
