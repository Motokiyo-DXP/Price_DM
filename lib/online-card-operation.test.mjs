import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseRemoteCardOperation } from "./online-card-operation.ts";

test("相手のカード操作イベントだけを受理する", () => {
  const payload = { active: true, cardId: "card-1", displayName: "相手", player: "p2", userId: "other" };
  assert.deepEqual(parseRemoteCardOperation(payload, "self"), payload);
  assert.equal(parseRemoteCardOperation(payload, "other"), null);
});

test("不正または不完全なRealtime payloadを拒否する", () => {
  assert.equal(parseRemoteCardOperation(null, "self"), null);
  assert.equal(parseRemoteCardOperation({ active: true, cardId: "card-1" }, "self"), null);
  assert.equal(parseRemoteCardOperation({ active: "yes", cardId: "card-1", displayName: "相手", player: "p2", userId: "other" }, "self"), null);
});

test("カード操作は保存stateではなくRealtimeの一時イベントとして接続される", () => {
  const onlineBoard = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");
  const playtestBoard = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
  assert.ok(onlineBoard.includes('event: "card_operation"'));
  assert.ok(onlineBoard.includes("onCardInteractionChange"));
  assert.ok(playtestBoard.includes("onPointerDownCapture"));
  assert.ok(playtestBoard.includes("RemoteCardInteractionIndicator"));
});
