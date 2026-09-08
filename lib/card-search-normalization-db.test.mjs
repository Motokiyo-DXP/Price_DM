import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260904145716_ignore_non_letter_characters_in_card_search.sql", import.meta.url), "utf8");

test("カード検索は許可文字以外を除去して全検索画面の共通DB関数へ適用する", () => {
  assert.match(migration, /create or replace function public\.normalize_card_search/);
  assert.match(migration, /normalize\(coalesce\(p_value, ''\), NFKC\)/);
  assert.match(migration, /\[\^a-zぁ-ゖ一-鿿㐀-䶿豈-﫿\]/);
  assert.match(migration, /update public\.card_search_terms/);
  assert.match(migration, /reindex index public\.cards_normalized_name_trgm_idx/);
});
