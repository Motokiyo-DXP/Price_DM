import assert from "node:assert/strict";
import test from "node:test";
import { buildSql, extractReadings, isSkippableCardPageStatus, pageTitleFor } from "./dmwiki-original01.mjs";

test("extracts ruby from the real dmwiki structure", () => {
  const html = '<h2>《“<ruby><rb>絶闘乱襲</rb><rp>(</rp><rt>ゼットラッシュ</rt><rp>)</rp></ruby>”ブランド》 <a class="anchor_super"> </a><span class="editsection">[<a>編集</a>]</span></h2>';
  assert.deepEqual(extractReadings(html, '“絶闘乱襲”ブランド'), { heading: '《“絶闘乱襲(ゼットラッシュ)”ブランド》', matched: true, readings: ["ゼットラッシュ"] });
  assert.equal(extractReadings(html, "別名").matched, false);
});
test("ignores parentheses not represented as ruby", () => assert.deepEqual(extractReadings("<h2>《ABC(別形態)》</h2>", "ABC(別形態)").readings, []));
test("uses wiki twin-pact separators", () => assert.equal(pageTitleFor("上面/下面"), "《上面／下面》"));
test("skips only forbidden individual card pages", () => {
  assert.equal(isSkippableCardPageStatus(403), true);
  assert.equal(isSkippableCardPageStatus(429), false);
  assert.equal(isSkippableCardPageStatus(500), false);
});
test("generates separate original01 search terms", () => {
  const sql = buildSql([{ name: '“絶闘乱襲”ブランド', readings: ["ゼットラッシュ"], source_url: "https://dmwiki.net/example" }]);
  assert.match(sql, /'alias_reading','original01'/);
  assert.doesNotMatch(sql, /update public\.canonical_cards/i);
});
