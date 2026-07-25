import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalImportSql } from "./build-dm-card-import.mjs";

const CARD = {
  name: "テスト'カード",
  name_kana: "テストカード",
  card_number: "1/100",
  product_name: "テスト商品",
  official_url: "https://dm.takaratomy.co.jp/card/detail/?id=test-1",
};

test("現行の正規カード・収録版・検索語へ冪等なSQLを生成する", () => {
  const sql = buildCanonicalImportSql([
    CARD,
    {
      ...CARD,
      card_number: "2/100",
      official_url: "https://dm.takaratomy.co.jp/card/detail/?id=test-2",
    },
  ]);

  assert.match(sql, /insert into public\.canonical_cards/);
  assert.match(sql, /group by source\.name/);
  assert.match(sql, /on conflict \(game_id, name\) where deleted_at is null/);
  assert.match(sql, /insert into public\.card_prints/);
  assert.match(sql, /on conflict \(official_card_id\)/);
  assert.match(sql, /insert into public\.card_search_terms/);
  assert.match(sql, /'machine_reading'/);
  assert.match(sql, /'generated'/);
  assert.match(sql, /テスト''カード/);
  assert.doesNotMatch(sql, /aliases/);
});

test("公式IDのないレコードを拒否する", () => {
  assert.throws(
    () => buildCanonicalImportSql([{ ...CARD, official_url: "https://example.com/card" }]),
    /official card id/,
  );
});
