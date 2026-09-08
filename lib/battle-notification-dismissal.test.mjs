import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
const online = readFileSync(new URL("../components/online-match-board.tsx", import.meta.url), "utf8");

test("スクロール中は対戦通知を維持する", () => {
  assert.match(board, /onScrollCapture=\{\(\) => \{ interactionScrolled\.current = true; \}\}/);
  assert.match(board, /if \(!interactionScrolled\.current/);
});

test("スクロール以外の操作終了時はローカル通知とオンライン通知を消す", () => {
  assert.match(board, /dismissInteractionNotifications\(\)/);
  assert.match(board, /setDismissedNotificationIds/);
  assert.match(board, /onNonScrollInteraction\?\.\(\)/);
  assert.match(online, /onNonScrollInteraction=\{\(\) => setOpponentActionNotice\(null\)\}/);
});
