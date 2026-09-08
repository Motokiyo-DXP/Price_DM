import assert from "node:assert/strict";
import test from "node:test";
import { PROFILE_ICON_MAX_INPUT_BYTES, PROFILE_ICON_SIZE, validateAccountName } from "./profile-icon.ts";

test("プロフィールアイコンはルーム表示用の128pxへ圧縮する", () => {
  assert.equal(PROFILE_ICON_SIZE, 128);
  assert.equal(PROFILE_ICON_MAX_INPUT_BYTES, 8 * 1024 * 1024);
});

test("アカウント名は空白を除く1〜30文字だけを許可する", () => {
  assert.equal(validateAccountName("  プレイヤー1  "), "プレイヤー1");
  assert.equal(validateAccountName(" "), null);
  assert.equal(validateAccountName("a".repeat(31)), null);
});
