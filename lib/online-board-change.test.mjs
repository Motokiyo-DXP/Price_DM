import assert from "node:assert/strict";
import test from "node:test";
import { describeOpponentBoardChange } from "./online-board-change.ts";

const card = (instanceId, face = "face_up") => ({ instanceId, face, name: instanceId });
const player = (zones = {}) => ({ deck: [], hand: [], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [], ...zones });
const board = (p1, p2 = player(), activePlayer = "p1") => ({ players: { p1, p2 }, activePlayer, turn: 1 });

test("カード名を漏らさず移動元・移動先・枚数を通知する", () => {
  const before = board(player({ hand: [card("secret", "owner_only")] }));
  const after = board(player({ mana: [card("secret", "face_up")] }));
  const message = describeOpponentBoardChange(before, after, "相手");
  assert.equal(message, "相手がカードを手札からマナへ移動しました");
  assert.ok(!message.includes("secret"));
});

test("同じ裏向きカード群の順番変更をシャッフルとして通知する", () => {
  const before = board(player({ deck: [card("a", "face_down"), card("b", "face_down"), card("c", "face_down")] }));
  const after = board(player({ deck: [card("c", "face_down"), card("a", "face_down"), card("b", "face_down")] }));
  assert.equal(describeOpponentBoardChange(before, after, "相手"), "相手が山札をシャッフルしました");
});

test("タップや表裏変更だけでは移動・シャッフル通知を出さない", () => {
  const before = board(player({ battle: [{ ...card("a"), tapped: false }] }));
  const after = board(player({ battle: [{ ...card("a"), tapped: true }] }));
  assert.equal(describeOpponentBoardChange(before, after, "相手"), null);
});
