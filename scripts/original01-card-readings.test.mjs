import assert from "node:assert/strict";
import test from "node:test";
import { buildOriginal01ReadingSql, extractOriginal01Readings, original01PageTitle } from "./original01-card-readings.mjs";
import { parseOriginal01Arguments } from "./fetch-original01-card-readings.mjs";

test("extracts the special reading only when the heading maps to the official name", () => {
  const html = '<h2>《“絶闘乱襲(ゼットラッシュ)”ブランド》 <a>編集</a></h2>';
  assert.deepEqual(extractOriginal01Readings(html, '“絶闘乱襲”ブランド'), {
    heading: '《“絶闘乱襲(ゼットラッシュ)”ブランド》', matched: true, readings: ["ゼットラッシュ"],
  });
  assert.equal(extractOriginal01Readings(html, "別のカード").matched, false);
});

test("does not treat ordinary parentheses as ruby", () => {
  assert.deepEqual(extractOriginal01Readings("<h2>《ABC(別形態)》</h2>", "ABC(別形態)").readings, []);
});

test("normalizes twin-pact separators for wiki page titles", () => {
  assert.equal(original01PageTitle("上面/下面"), "《上面／下面》");
});

test("requires a considerate request interval", () => {
  assert.throws(() => parseOriginal01Arguments(["--delay-ms=100"]), /cannot be lower/);
});

test("builds separate searchable terms with source original01", () => {
  const sql = buildOriginal01ReadingSql([{ name: '“絶闘乱襲”ブランド', readings: ["ゼットラッシュ"], source_url: "https://dmwiki.net/example" }]);
  assert.match(sql, /'alias_reading'/);
  assert.match(sql, /'original01'/);
  assert.doesNotMatch(sql, /update public\.canonical_cards/i);
});
