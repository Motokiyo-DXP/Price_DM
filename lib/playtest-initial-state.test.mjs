import assert from "node:assert/strict";
import test from "node:test";
import { initialOnlineBoard } from "./playfield-board.ts";
import { resolvePlaytestInitialState } from "./playtest-initial-state.ts";

const cards = Array.from({ length: 10 }, (_, index) => ({
  canonicalCardId: index + 1,
  imageUrl: null,
  name: `カード${index + 1}`,
  quantity: 1,
  sortOrder: index,
}));

test("SSRで生成した初期盤面をhydrationでも作り直さずそのまま使用する", () => {
  const serverInitialState = initialOnlineBoard(cards, cards, () => 0.25);
  const resolved = resolvePlaytestInitialState(serverInitialState, undefined);

  assert.strictEqual(resolved, serverInitialState);
  assert.deepEqual(
    resolved.players.p1.hand.map((card) => card.instanceId),
    serverInitialState.players.p1.hand.map((card) => card.instanceId),
  );
});

test("オンライン対戦では外部の最新盤面を初期盤面より優先する", () => {
  const serverInitialState = initialOnlineBoard(cards, cards, () => 0.25);
  const externalState = initialOnlineBoard(cards, cards, () => 0.75);

  assert.strictEqual(resolvePlaytestInitialState(serverInitialState, externalState), externalState);
});
