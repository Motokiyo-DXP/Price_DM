import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCardRulesUpdateSql,
  normalizeRulesRecords,
  validateRulesCoverage,
} from "./build-dm-card-rules-update.mjs";
import {
  DM_CARD_RULES_NAME_EQUIVALENTS,
  resolveDuelMastersRulesCanonicalName,
} from "./dm-canonical-equivalents.mjs";

const RECORD = {
  name: "テストカード",
  official_card_id: "test-001",
  official_url: "https://dm.takaratomy.co.jp/card/detail/?id=test-001",
  races: ["ドラゴン", "ヒューマノイド", "ドラゴン"],
  card_texts: ["S・トリガー\n能力。", ""],
};

test("rules update validates print identities and builds one transaction with count guards", () => {
  const records = normalizeRulesRecords([RECORD]);
  assert.deepEqual(records[0].races, ["ドラゴン", "ヒューマノイド"]);
  const sql = buildCardRulesUpdateSql(records);
  assert.match(sql, /^begin;/);
  assert.match(sql, /official_card_id text not null primary key/);
  assert.match(sql, /name_nfkc text not null/);
  assert.equal((sql.match(/select distinct race_values\.race collate "C" as race/g) ?? []).length, 1);
  assert.match(sql, /select distinct race_values\.race collate "C" as race[\s\S]*?order by race\s/);
  assert.doesNotMatch(sql, /select distinct race_values\.race\s[\s\S]{0,250}?order by race_values\.race collate "C"/);
  assert.match(sql, /update public\.canonical_cards[\s\S]*set races = source\.races/);
  assert.match(sql, /update public\.card_prints[\s\S]*set card_texts = source\.card_texts/);
  assert.match(sql, /count\(distinct canonical\.id\) <> 1/);
  assert.match(sql, /prints\.official_card_id = source\.official_card_id/);
  assert.match(sql, /canonical\.normalized_name_nfkc = source\.name_nfkc/);
  assert.match(sql, /manually locked/);
  assert.match(sql, /updated_count <> expected_canonical_count/);
  assert.match(sql, /updated_count <> expected_print_count/);
  assert.match(sql, /raise exception/);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql, /S・トリガー/);
  assert.match(sql, /array\['ドラゴン', 'ヒューマノイド'\]::text\[\]/);
  assert.match(sql, /array\['S・トリガー\n能力。', ''\]::text\[\]/);
});

test("rules update refuses missing, mismatched, duplicate, or malformed records", () => {
  assert.throws(() => normalizeRulesRecords([{ ...RECORD, official_card_id: "wrong" }]), /does not match its URL/);
  assert.throws(() => normalizeRulesRecords([RECORD, RECORD]), /Duplicate rules record/);
  assert.throws(() => normalizeRulesRecords([{ ...RECORD, card_texts: [] }]), /invalid card texts/);
  assert.throws(() => buildCardRulesUpdateSql([]), /input is empty/);
});

test("rules update requires complete coverage of every source print", () => {
  const [record] = normalizeRulesRecords([RECORD]);
  const sources = [{ name: "テストカード", official_url: RECORD.official_url }];
  const manifest = {
    complete: true,
    failure_count: 0,
    rules_print_count: 1,
    source_print_count: 1,
  };
  assert.equal(validateRulesCoverage(sources, [record], manifest)[0].name, RECORD.name);
  assert.throws(() => validateRulesCoverage(sources, [record], { ...manifest, complete: false }), /incomplete/);
  assert.throws(() => validateRulesCoverage(sources, [], { ...manifest, rules_print_count: 0 }), /incomplete/);
  assert.throws(() => validateRulesCoverage([{ ...sources[0], official_url: RECORD.official_url.replace("test-001", "other") }], [record], manifest), /source print URL/);
});

test("NFKC-only rules name variants resolve to the source canonical identity", () => {
  const source = [{ name: "テスト ＜Ａ＞", official_url: RECORD.official_url }];
  const record = normalizeRulesRecords([{ ...RECORD, name: "テスト <A>" }]);
  const manifest = { complete: true, failure_count: 0, rules_print_count: 1, source_print_count: 1 };
  const resolved = validateRulesCoverage(source, record, manifest);
  assert.equal(resolved[0].name, "テスト ＜Ａ＞");
  assert.match(buildCardRulesUpdateSql(resolved), /'テスト <A>'/);
});

test("only the exact official-ID/name pairs on the audited allowlist resolve non-NFKC differences", () => {
  assert.equal(DM_CARD_RULES_NAME_EQUIVALENTS.size, 13);
  for (const [id, pair] of DM_CARD_RULES_NAME_EQUIVALENTS) {
    assert.equal(resolveDuelMastersRulesCanonicalName({ name: pair.sourceName }, { name: pair.rulesName }, id), pair.sourceName);
    assert.equal(resolveDuelMastersRulesCanonicalName({ name: `${pair.sourceName}x` }, { name: pair.rulesName }, id), null);
    assert.equal(resolveDuelMastersRulesCanonicalName({ name: pair.sourceName }, { name: `${pair.rulesName}x` }, id), null);
  }
});

test("rules update normalizes NFKC race variants but preserves distinct official race names", () => {
  const sql = buildCardRulesUpdateSql([{
    ...RECORD,
    races: ["アーマード･ドラゴン", "アーマードドラゴン", "アーマード・ドラゴン"],
  }]);
  assert.match(sql, /array\['アーマードドラゴン', 'アーマード・ドラゴン'\]::text\[\]/u);
  assert.doesNotMatch(sql, /アーマード･ドラゴン/u);
});
