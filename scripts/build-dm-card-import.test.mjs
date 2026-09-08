import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalImportSql, mergeCardMetadata } from "./build-dm-card-import.mjs";

const CARD = {
  name: "テスト'カード",
  name_kana: "テストカード",
  card_number: "1/100",
  product_name: "テスト商品",
  card_types: ["クリーチャー"],
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
  assert.match(sql, /card_types/);
  assert.match(sql, /group by source\.name/);
  assert.match(sql, /on conflict \(game_id, name\) where deleted_at is null/);
  assert.match(sql, /insert into public\.card_prints/);
  assert.match(sql, /on conflict \(official_card_id\)/);
  assert.match(sql, /product_name = coalesce\(public\.card_prints\.product_name, excluded\.product_name\)/);
  assert.match(sql, /insert into public\.card_search_terms/);
  assert.match(sql, /'machine_reading'/);
  assert.match(sql, /'generated'/);
  assert.match(sql, /テスト''カード/);
  assert.doesNotMatch(sql, /aliases/);
});

test("同名カードへ最新の収集メタデータをマージする", () => {
  const merged = mergeCardMetadata(
    [{ ...CARD, card_types: [] }],
    [
      { name: CARD.name, card_types: ["呪文"] },
      { name: CARD.name, card_types: ["クリーチャー", "呪文"] },
    ],
  );
  assert.deepEqual(merged[0].card_types, ["クリーチャー", "呪文"]);
});

test("公式IDのないレコードを拒否する", () => {
  assert.throws(
    () => buildCanonicalImportSql([{ ...CARD, official_url: "https://example.com/card" }]),
    /official card id/,
  );
});

test("plus sign in an official id is not decoded as a space", () => {
  const sql = buildCanonicalImportSql([{ ...CARD, official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-003" }]);
  assert.match(sql, /dm34\+1s-003/);
  assert.doesNotMatch(sql, /dm34 1s-003/);
});

test("DMART-26の別名カードをゲーム上の正式カードへ収録版として統合する", () => {
  const sql = buildCanonicalImportSql([{
    ...CARD,
    name: "ゲンム装備【ヘビィボウガン】vs.波衣竜 ∞龍 ゲンムエンペラー",
    card_number: "DMART26 2/6",
    official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dmart26-002",
  }]);
  assert.match(sql, /∞龍 ゲンムエンペラー/);
  assert.doesNotMatch(sql, /ゲンム装備/);
});
