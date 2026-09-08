import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CARD_SEARCH_DEBOUNCE_MS } from "./search-timing.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260905063221_optimize_canonical_card_search.sql", import.meta.url), "utf8");
const market = readFileSync(new URL("../components/market-list.tsx", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/deck-editor.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");

test("カード検索はカードごとのLATERAL反復を行わず検索元を一度ずつ集計する", () => {
  assert.match(migration, /term_matches as materialized/);
  assert.match(migration, /print_matches as materialized/);
  assert.doesNotMatch(migration, /join lateral/i);
});

test("すべてのカード検索画面は短縮した共通デバウンスを使う", () => {
  assert.equal(CARD_SEARCH_DEBOUNCE_MS, 50);
  assert.match(market, /CARD_SEARCH_DEBOUNCE_MS/);
  assert.match(deck, /CARD_SEARCH_DEBOUNCE_MS/);
  assert.match(register, /CARD_SEARCH_DEBOUNCE_MS/);
  assert.match(register, /}, 250\);/);
});
