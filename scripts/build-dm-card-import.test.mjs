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
  cost: 7,
  cost_is_infinite: false,
  card_types: ["クリーチャー"],
  races: ["種族A"],
  card_texts: ["能力A。"],
  power_text: "5000",
  power_value: 5000,
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
  assert.match(sql, /cost_is_infinite boolean not null/);
  assert.match(sql, /power_text text/);
  assert.match(sql, /power_value integer/);
  assert.match(sql, /cost_is_infinite = excluded\.cost_is_infinite/);
  assert.match(sql, /power_text = excluded\.power_text/);
  assert.match(sql, /power_value = excluded\.power_value/);
  assert.match(sql, /races text\[\]/);
  assert.match(sql, /card_texts text\[\]/);
  assert.match(sql, /races_complete boolean not null/);
  assert.match(sql, /card_texts_complete boolean not null/);
  assert.equal((sql.match(/select distinct race_values\.race collate "C" as race/g) ?? []).length, 2);
  assert.equal((sql.match(/order by race\s/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /select distinct race_values\.race\s[\s\S]{0,250}?order by race_values\.race collate "C"/);
  assert.match(sql, /card_texts = case[\s\S]*?source\.card_texts_complete/);
  assert.match(sql, /group by source\.name/);
  assert.match(sql, /on conflict \(game_id, normalized_name_nfkc\) where deleted_at is null/);
  assert.match(sql, /canonical\.normalized_name_nfkc = normalize\(source\.name, NFKC\)/);
  assert.match(sql, /lower\(prints\.official_card_id\) = lower\(source\.official_card_id\)/);
  assert.match(sql, /set official_card_id = source\.official_card_id/);
  assert.match(sql, /insert into public\.card_prints/);
  assert.match(sql, /on conflict \(official_card_id\)/);
  assert.match(sql, /product_name = coalesce\(public\.card_prints\.product_name, excluded\.product_name\)/);
  assert.match(sql, /insert into public\.card_search_terms/);
  assert.match(sql, /select distinct on \(canonical\.id, public\.normalize_card_search\(source\.name\)\)/);
  assert.match(sql, /select distinct on \(canonical\.id, public\.normalize_card_search\(source\.generated_reading\)\)/);
  assert.match(sql, /order by canonical\.id, public\.normalize_card_search\(source\.generated_reading\), source\.generated_reading collate "C"/);
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

test("NFKC同一の公式表記は1つのcanonical identityへ集約する", () => {
  const cards = [
    { ...CARD, name: "テスト ＜Ａ＞", races: ["種族A"], official_url: "https://dm.takaratomy.co.jp/card/detail/?id=nfkc-a" },
    { ...CARD, name: "テスト <A>", races: ["種族B"], official_url: "https://dm.takaratomy.co.jp/card/detail/?id=nfkc-b" },
  ];
  const merged = mergeCanonicalRaces(cards);
  assert.deepEqual(merged.map((card) => card.races), [["種族A", "種族B"], ["種族A", "種族B"]]);

  const sql = buildCanonicalImportSql(cards);
  const sourceValues = sql.match(/values\s+([\s\S]*?);\s*\n\s*with duel_masters/u)?.[1];
  assert.ok(sourceValues);
  assert.equal((sourceValues.match(/'テスト <A>'/gu) ?? []).length, 2);
  assert.doesNotMatch(sourceValues, /テスト＜Ａ＞/u);
  assert.match(sql, /normalized_name_nfkc\) where deleted_at is null do update/u);
});

test("NFKC表記違いのメタデータも同一カードへ適用する", () => {
  const merged = mergeCardMetadata(
    [{ ...CARD, name: "テスト ＜Ａ＞", card_types: [] }],
    [{ name: "テスト <A>", card_types: ["クリーチャー"] }],
  );
  assert.deepEqual(merged[0].card_types, ["クリーチャー"]);
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

test("種族はNFKC同一表記を統合し、別表記の種族を保持する", () => {
  const merged = mergeCanonicalRaces([
    { ...CARD, name: "表記差カード", races: ["アーマード･ドラゴン", "アーマードドラゴン"] },
    { ...CARD, name: "表記差カード", races: ["アーマード・ドラゴン"] },
  ]);
  assert.deepEqual(merged[0].races, ["アーマードドラゴン", "アーマード・ドラゴン"]);
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

test("canonical metadata SQL keeps infinite cost, special power, and print text/races together", () => {
  const card = {
    ...CARD,
    name: "∞ test",
    cost: null,
    cost_is_infinite: true,
    power_text: "∞",
    power_value: null,
    races: ["ドラゴン", "種族B"],
    card_texts: ["能力。", ""],
    official_url: "https://dm.takaratomy.co.jp/card/detail/?id=infinite-test",
  };
  const sql = buildCanonicalImportSql([card]);
  assert.match(sql, /null,\s*true/);
  assert.match(sql, /array\['ドラゴン', '種族B'\]::text\[\]/);
  assert.match(sql, /'∞',\s*null/);
  assert.match(sql, /coalesce\(bool_or\(source\.cost_is_infinite\), false\)/);
  assert.match(sql, /source\.card_texts_complete/);
});

test("rules import accepts only audited official name differences and keeps the source canonical name", () => {
  const sourceName = "ファンタズ厶・クラッチ";
  const rulesName = "ファンタズム・クラッチ";
  const card = {
    ...CARD,
    name: sourceName,
    official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm17-014",
  };
  const rule = {
    name: rulesName,
    official_card_id: "dm17-014",
    official_url: card.official_url,
    races: ["種族B"],
    card_texts: ["能力B。"],
  };
  assert.equal(mergePrintRules([card], [rule])[0].name, sourceName);
  assert.throws(() => mergePrintRules([card], [{ ...rule, name: `${rulesName}改` }]), /does not match official card ID/);
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
