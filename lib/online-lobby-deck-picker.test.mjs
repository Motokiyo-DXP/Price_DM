import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ロビーの選択中デッキは編集ボタンから編集画面を開ける", () => {
  const picker = readFileSync(new URL("../components/online-lobby-deck-picker.tsx", import.meta.url), "utf8");
  assert.match(picker, /className="online-lobby-deck-edit"/);
  assert.match(picker, /href={`\/decks\/\$\{selected\.id\}\/edit`}/);
});
