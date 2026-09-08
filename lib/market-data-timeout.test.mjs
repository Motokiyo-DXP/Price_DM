import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("相場データ障害時もトップページを長時間ブロックしない", () => {
  const source = readFileSync(new URL("./market-data.ts", import.meta.url), "utf8");
  assert.match(source, /const MARKET_DATA_TIMEOUT_MS = 5_000/);
  assert.match(source, /\.abortSignal\(AbortSignal\.timeout\(MARKET_DATA_TIMEOUT_MS\)\)/);
});

test("相場データの失敗結果を成功キャッシュに保存しない", () => {
  const source = readFileSync(new URL("./market-data.ts", import.meta.url), "utf8");
  assert.match(source, /const loadMarketCardsCached = unstable_cache\(\s*fetchMarketCards/);
  assert.match(source, /throw summaryResult\.error/);
  assert.match(source, /cards: await loadMarketCardsCached\(\)/);
});
