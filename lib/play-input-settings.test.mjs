import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  LONG_PRESS_DEFAULT_MS,
  LONG_PRESS_MAX_MS,
  LONG_PRESS_MIN_MS,
  LONG_PRESS_STEP_MS,
  normalizeLongPressMs,
} from "./play-input-settings.ts";
import { getLongPressProgress } from "./long-press-progress.ts";
import { STACK_HOLD_MENU_MS, STACK_HOLD_PROGRESS_MS } from "./playfield-interactions.ts";
import { OTHER_BRANCH_HOLD_MS } from "./marking-menu.ts";

test("長押し設定は400msを初期値に320〜600ms、20ms刻みで正規化する", () => {
  assert.equal(LONG_PRESS_DEFAULT_MS, 400);
  assert.equal(LONG_PRESS_MIN_MS, 320);
  assert.equal(LONG_PRESS_MAX_MS, 600);
  assert.equal(LONG_PRESS_STEP_MS, 20);
  assert.equal(normalizeLongPressMs(Number.NaN), 400);
  assert.equal(normalizeLongPressMs(319), 320);
  assert.equal(normalizeLongPressMs(321), 320);
  assert.equal(normalizeLongPressMs(339), 340);
  assert.equal(normalizeLongPressMs(600), 600);
  assert.equal(normalizeLongPressMs(601), 600);
  for (let value = 320; value <= 600; value += 1) {
    const normalized = normalizeLongPressMs(value);
    assert.ok(normalized >= 320 && normalized <= 600);
    assert.equal((normalized - 320) % 20, 0);
  }
});

test("円形メーターは50%到達までは非表示で、表示時に実経過率を引き継ぐ", () => {
  assert.equal(getLongPressProgress(0, 400), null);
  assert.equal(getLongPressProgress(199, 400), null);
  assert.equal(getLongPressProgress(200, 400), null);
  assert.deepEqual(getLongPressProgress(201, 400), { progress: 201 / 400, remainingMs: 199 });
  assert.deepEqual(getLongPressProgress(400, 400), { progress: 1, remainingMs: 0 });
  assert.equal(getLongPressProgress(250, 500), null);
  assert.ok(getLongPressProgress(251, 500).progress > 0.5);
  assert.equal(getLongPressProgress(150, 300), null);
  assert.ok(getLongPressProgress(151, 300).progress > 0.5);
});

test("重ね方は250ms表示・500ms成立、「その他」は150ms表示・300ms成立", () => {
  assert.equal(STACK_HOLD_PROGRESS_MS, 250);
  assert.equal(STACK_HOLD_MENU_MS, 500);
  assert.equal(OTHER_BRANCH_HOLD_MS, 300);
});

test("長押し設定はprofilesを正本にし、旧localStorage値を参照しない", async () => {
  const [settings, board, soloPage, onlinePage, migration] = await Promise.all([
    readFile(new URL("./play-input-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/playtest-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/playtest/[deckId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/rooms/[roomId]/battle/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260923220829_long_press_account_settings.sql", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(settings, /localStorage|dm-play-long-press-ms/);
  assert.doesNotMatch(board, /readLongPressMs|saveLongPressMs|dm-play-long-press-ms/);
  assert.match(soloPage, /from\("profiles"\)\.select\("long_press_ms"\)/);
  assert.match(onlinePage, /from\("profiles"\)\.select\("long_press_ms"\)/);
  assert.match(migration, /long_press_ms integer not null default 400/);
  assert.match(migration, /long_press_ms between 320 and 600/);
  assert.match(migration, /grant update \(long_press_ms\)\s+on public\.profiles to authenticated/);
  assert.match(migration, /create policy[\s\S]*on realtime\.messages for select[\s\S]*auth\.uid\(\)/);
  assert.match(migration, /realtime\.send\([\s\S]*'profile-settings:'/);
});
