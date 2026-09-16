import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RuleSourceError,
  checkRuleSource,
  compareRuleSource,
  parseManifestBaseline,
  parseRuleIndexHtml,
} from "./check-dm-rule-source.mjs";

const fixture = async (name) => readFile(new URL(`./fixtures/rule-source/${name}`, import.meta.url), "utf8");

test("公式Index fixtureからVersion、更新日、PDF URLを抽出する", async () => {
  const observed = parseRuleIndexHtml(await fixture("index-current.html"), "https://dm.takaratomy.co.jp/rule/rulechange/");
  assert.deepEqual(observed, {
    version: "1.51",
    date: "2026-07-23",
    pdfUrl: "https://dm.takaratomy.co.jp/img/dm_rule_20260723_5.pdf",
  });
});

test("manifest baselineと一致すればNO_CHANGEを返す", async () => {
  const result = await checkRuleSource({
    manifestText: await fixture("source-manifest.yaml"),
    html: await fixture("index-current.html"),
  });
  assert.equal(result.status, "NO_CHANGE");
  assert.deepEqual(result.changes, []);
});

test("Version、更新日、PDF URLの差分をCHANGE_DETECTEDとして列挙する", async () => {
  const baseline = parseManifestBaseline(await fixture("source-manifest.yaml"));
  const observed = parseRuleIndexHtml(await fixture("index-changed.html"), baseline.indexUrl);
  const result = compareRuleSource(baseline, observed);
  assert.equal(result.status, "CHANGE_DETECTED");
  assert.deepEqual(result.changes.map(({ field }) => field), ["version", "date", "pdfUrl"]);
});

test("Version、更新日、PDF URLの単独差分もそれぞれCHANGE_DETECTEDにする", async () => {
  const baseline = parseManifestBaseline(await fixture("source-manifest.yaml"));
  for (const field of ["version", "date", "pdfUrl"]) {
    const observed = { ...baseline, [field]: `${baseline[field]}-changed` };
    const result = compareRuleSource(baseline, observed);
    assert.equal(result.status, "CHANGE_DETECTED");
    assert.deepEqual(result.changes.map((change) => change.field), [field]);
  }
});

for (const [fixtureName, expectedMessage] of [
  ["index-missing-version.html", /rule_version_not_found/u],
  ["index-missing-date.html", /rule_date_not_found/u],
  ["index-missing-pdf.html", /invalid_pdf_url/u],
]) {
  test(`${fixtureName}: 必須metadata欠損をPARSER_ERRORにする`, async () => {
    await assert.rejects(
      checkRuleSource({
        manifestText: await fixture("source-manifest.yaml"),
        html: await fixture(fixtureName),
      }),
      (error) => error instanceof RuleSourceError && error.kind === "PARSER_ERROR" && expectedMessage.test(error.message),
    );
  });
}

test("不完全なmanifestをMANIFEST_ERRORにする", () => {
  assert.throws(
    () => parseManifestBaseline("version: 1\nsources: []\n"),
    (error) => error instanceof RuleSourceError && error.kind === "MANIFEST_ERROR",
  );
});

test("Network failureをNETWORK_ERRORにする", async () => {
  await assert.rejects(
    checkRuleSource({
      manifestText: await fixture("source-manifest.yaml"),
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    (error) => error instanceof RuleSourceError && error.kind === "NETWORK_ERROR",
  );
});
