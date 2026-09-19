import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CARD_SEARCH_DEBOUNCE_MS } from "./search-timing.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260905063221_optimize_canonical_card_search.sql", import.meta.url), "utf8");
const market = readFileSync(new URL("../components/market-list.tsx", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/deck-editor.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");
const registrationMigration = readFileSync(
  new URL("../supabase/migrations/20260919130001_optimize_registration_card_search.sql", import.meta.url),
  "utf8",
);
const registrationCompatibilityTest = readFileSync(
  new URL("../supabase/tests/registration_card_search_compatibility.sql", import.meta.url),
  "utf8",
);

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

test("登録画面専用検索は短文prefixと3文字以上のtrigram候補を分離する", () => {
  assert.match(registrationMigration, /create function public\.search_registration_cards/);
  assert.match(registrationMigration, /char_length\(input\.normalized_query\) between 1 and 2/);
  assert.match(registrationMigration, /normalized_term text_pattern_ops/);
  assert.match(registrationMigration, /operator\(extensions\.%%?\)/);
  assert.match(registrationMigration, /similarity\(terms\.normalized_term, input\.normalized_query\) >= input\.threshold/);
  assert.match(registrationMigration, /card_prints_card_number_lower_prefix_active_idx/);
  assert.match(registrationMigration, /card_prints_product_name_lower_prefix_active_idx/);
  assert.doesNotMatch(registrationMigration, /candidate_ids/);
  assert.doesNotMatch(registrationMigration, /left join term_matches/i);
});

test("登録画面のカード検索は取消・IME抑制・入力から描画までの計測を行う", () => {
  assert.match(register, /rpc\("search_registration_cards"/);
  assert.match(register, /abortSignal\(controller\.signal\)/);
  assert.match(register, /requestSequence !== cardSearchRequestSequence\.current/);
  assert.match(register, /onCompositionStart/);
  assert.match(register, /onCompositionEnd/);
  assert.match(register, /register-card-search-input-to-render/);
});

test("登録検索のDB互換テストは短文・名前・収録版・alias・読み・検索モードを対象にする", () => {
  for (const requiredCase of [
    "ボ",
    "ボル",
    "ボルシャック",
    "ギギャイア",
    "RP3",
    "alias",
    "reading",
    "card_number",
    "product_name",
    "broad",
    "precise",
  ]) {
    assert.match(registrationCompatibilityTest, new RegExp(requiredCase));
  }
  assert.match(registrationCompatibilityTest, /search_canonical_cards/);
  assert.match(registrationCompatibilityTest, /search_registration_cards/);
});
