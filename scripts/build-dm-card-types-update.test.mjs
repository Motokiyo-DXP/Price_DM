import assert from "node:assert/strict";
import test from "node:test";

import { buildCardTypesUpdateSql } from "./build-dm-card-types-update.mjs";

test("カード種類の全件一致を保証する更新SQLを生成する", () => {
  const sql = buildCardTypesUpdateSql([
    { name: "テスト'カード", card_types: ["クリーチャー", "呪文"] },
  ]);
  assert.match(sql, /テスト''カード/);
  assert.match(sql, /array\['クリーチャー', '呪文'\]::text\[\]/);
  assert.match(sql, /updated_count <> \(select count\(\*\) from dm_card_types_source\)/);
});
