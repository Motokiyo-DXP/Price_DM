import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalImportSql,
  mergeCanonicalRaces,
  mergeCardMetadata,
  mergePrintRules,
} from "./build-dm-card-import.mjs";

const CARD = {
  name: "テスト'カード",
  name_kana: "テストカード",
  card_number: "1/100",
  product_name: "テスト商品",
  card_types: ["クリーチャー"],
  races: ["種族A"],
  card_texts: ["能力A。"],
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
  assert.match(sql, /races text\[\]/);
  assert.match(sql, /card_texts text\[\]/);
  assert.match(sql, /races_complete boolean not null/);
  assert.match(sql, /card_texts_complete boolean not null/);
  assert.match(sql, /order by race_values\.race collate "C"/);
  assert.match(sql, /card_texts = case[\s\S]*?source\.card_texts_complete/);
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

test("同名カードの種族を全printから空要素なしで決定的にunionする", () => {
  const merged = mergeCanonicalRaces([
    { ...CARD, name: "同名", races: ["ドラゴン", "ヒューマノイド"] },
    { ...CARD, name: "同名", races: ["ドラゴン", "アーマード"] },
  ]);
  assert.deepEqual(merged.map((card) => card.races), [
    ["アーマード", "ドラゴン", "ヒューマノイド"],
    ["アーマード", "ドラゴン", "ヒューマノイド"],
  ]);
  assert.equal(merged.every((card) => card.races_complete), true);
});

test("parse未完了のracesとcard_textsで既存値を上書きしないSQLを生成する", () => {
  const card = { ...CARD };
  delete card.races;
  delete card.card_texts;
  const sql = buildCanonicalImportSql([card]);
  assert.match(sql, /false,\s*null,\s*false/);
  assert.match(sql, /and source\.races_complete/);
  assert.match(sql, /else public\.card_prints\.card_texts/);
});

test("rules backfill records are joined by matching official print ID", () => {
  const rule = {
    name: CARD.name,
    official_card_id: "test-1",
    official_url: CARD.official_url,
    races: ["種族B"],
    card_texts: [""],
  };
  const merged = mergePrintRules([CARD], [rule]);
  assert.deepEqual(merged[0].races, ["種族B"]);
  assert.deepEqual(merged[0].card_texts, [""]);
  assert.throws(() => mergePrintRules([CARD], [{ ...rule, official_card_id: "other-id" }]), /does not match its URL/);
  assert.throws(() => mergePrintRules([CARD], [{ ...rule, name: "別カード" }]), /does not match official card ID/);
});

test("公式IDのないレコードを拒否する", () => {
  assert.throws(
    () => buildCanonicalImportSql([{ ...CARD, official_url: "https://example.com/card" }]),
    /official card id/,
  );
});

test("重複official IDを検出してSQL生成前に止める", () => {
  assert.throws(() => buildCanonicalImportSql([CARD, CARD]), /Duplicate official card id/);
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

test("DMART-10の別名カードをゲーム上の正式カードへ収録版として統合する", () => {
  const sql = buildCanonicalImportSql([{
    ...CARD,
    name: "バンブルビー [切札勝太&カツキング ー熱血の物語ー]",
    card_number: "DMART10 3/6",
    official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dmart10-003",
  }]);
  assert.match(sql, /切札勝太&カツキング ー熱血の物語ー/);
  assert.doesNotMatch(sql, /バンブルビー/);
});
