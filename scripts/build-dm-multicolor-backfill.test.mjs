import assert from "node:assert/strict";
import test from "node:test";

import { buildBackfillSql, parseOfficialCardIds } from "./build-dm-multicolor-backfill.mjs";

test("公式検索結果からカードIDを正規化して重複なく取得する", () => {
  const html = '<a href="/card/detail/?id=DM26SD1-B011"></a><a href="/card/detail/?id=DM26SD1-B011"></a><a href="/card/detail/?id=dm24bd4-010"></a>';
  assert.deepEqual(parseOfficialCardIds(html), ["dm26sd1-b011", "dm24bd4-010"]);
});

test("公式IDと複数文明からcanonical_cards更新SQLを生成する", () => {
  const sql = buildBackfillSql(new Map([["dm26sd1-b011", new Set(["water", "darkness", "nature"])]]));
  assert.match(sql, /lower\(cp\.official_card_id\) = source\.official_card_id/u);
  assert.match(sql, /array\['darkness', 'nature', 'water'\]::text\[\]/u);
  assert.match(sql, /cc\.civilizations is distinct from resolved\.civilizations/u);
});
