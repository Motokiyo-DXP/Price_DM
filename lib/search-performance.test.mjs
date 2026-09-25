import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CARD_SEARCH_DEBOUNCE_MS } from "./search-timing.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260905063221_optimize_canonical_card_search.sql", import.meta.url), "utf8");
const market = readFileSync(new URL("../components/market-list.tsx", import.meta.url), "utf8");
const marketSearchMigration = readFileSync(
  new URL("../supabase/migrations/20260923161835_add_home_market_search_rpc.sql", import.meta.url),
  "utf8",
);
const firstResponseMigration = readFileSync(
  new URL("../supabase/migrations/20260924185334_deck_market_search_first_response.sql", import.meta.url),
  "utf8",
);
const marketCompatibilityTest = readFileSync(
  new URL("../supabase/tests/home_market_search_compatibility.sql", import.meta.url),
  "utf8",
);
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
const registrationCardNumberRepair = readFileSync(
  new URL("../supabase/migrations/20260919130002_fix_registration_card_number_search.sql", import.meta.url),
  "utf8",
);
const registrationLongSearchOptimization = readFileSync(
  new URL("../supabase/migrations/20260923145858_optimize_registration_long_search.sql", import.meta.url),
  "utf8",
);
const registrationShortSearch = readFileSync(
  new URL("../supabase/migrations/20260919130003_split_registration_short_search_paths.sql", import.meta.url),
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

test("デッキ検索は条件変更で旧requestを中断し、IME中も表示中のqueryを検索する", () => {
  assert.match(deck, /searchControllerRef\.current\?\.abort\(\)/);
  assert.match(deck, /abortSignal\(signal\)/);
  assert.match(deck, /requestId !== searchRequestRef\.current \|\| signal\.aborted/);
  assert.match(deck, /useImeRealtimeInput/);
  assert.match(deck, /onCompositionEnd/);
  assert.doesNotMatch(deck, /if \(isComposing\) return/);
  assert.match(deck, /searchStatusKey === currentSearchKey \? searchStatus : "searching"/);
  assert.match(deck, /resultsAreCurrent = resultsSearchKey === currentSearchKey/);
  assert.match(deck, /disabled=\{!resultsAreCurrent \|\| cannotAdd\}/);
  assert.match(deck, /currentSearchStatus === "empty"/);
  const pageLoader = deck.split("const loadSearchPage =")[1].split("function handleResultScroll")[0];
  assert.doesNotMatch(pageLoader, /from\("card_prints"\)|from\("canonical_cards"\)/);
});

test("デッキ検索RPCの初回行からカード画像を読み込み、詳細情報はクリック時に取得する", () => {
  assert.match(deck, /CardArtwork eager=\{index === 0\}/);
  assert.match(deck, /hydrated: false/);
  assert.match(deck, /row\.representative_print_id/);
  assert.match(deck, /row\.image_key/);
  assert.match(deck, /async function openCard/);
  assert.match(firstResponseMigration, /representative_print_id bigint/);
  assert.match(firstResponseMigration, /image_key text/);
});

test("デッキ検索は短文prefix候補を先に絞り、属性集計を候補に限定する", () => {
  const shortTerms = firstResponseMigration.split("$short_terms$")[1];
  assert.match(firstResponseMigration, /card_search_terms_normalized_prefix_idx[\s\S]*?include \(canonical_card_id\)/);
  assert.match(firstResponseMigration, /candidate_ids as materialized/);
  assert.match(firstResponseMigration, /from filtered_candidates as candidates[\s\S]*?group by deck_cards\.canonical_card_id/);
  assert.match(firstResponseMigration, /case when p_sort = 'release_date' then \([\s\S]*?where prints\.canonical_card_id = candidates\.id/);
  assert.match(shortTerms, /operator\(pg_catalog\.~>=~\)/);
  assert.match(shortTerms, /operator\(pg_catalog\.~<~\)/);
  assert.doesNotMatch(shortTerms, /operator\(extensions\.\%\)|operator\(pg_catalog\.~~\)\s*\('%'/);
  assert.match(firstResponseMigration, /cardinality\(p_civilizations\)/);
  assert.match(firstResponseMigration, /cards\.card_types && p_card_types/);
  assert.match(firstResponseMigration, /p_image = 'with'/);
});

test("検索順は名前prefixを別名・読みprefixより優先し、同程度なら使用数で並べる", () => {
  assert.match(firstResponseMigration, /match_tier smallint/);
  assert.match(firstResponseMigration, /when terms\.normalized_term = \$1 then 0/);
  assert.match(firstResponseMigration, /when pg_catalog\.char_length\(\$1\) = 1 then 1/);
  assert.match(firstResponseMigration, /terms\.term_kind in \('official_name', 'face_name'\) then 1/);
  assert.match(firstResponseMigration, /else 2/);
  assert.match(firstResponseMigration, /3::smallint/);
  assert.match(firstResponseMigration, /4::smallint/);
  assert.match(firstResponseMigration, /candidates\.match_tier end asc[\s\S]*?candidates\.match_score end desc[\s\S]*?candidates\.total end desc/);
  assert.match(deck, /useState<DeckSearchSortKey>\("relevance"\)/);
  assert.match(deck, /useState<SortDirection>\("asc"\)/);
  assert.match(market, /useState<MarketSort>\("search"\)/);
  assert.match(market, /if \(trimmedQuery && sortMode === "search"\) return matchingCards/);
  assert.match(firstResponseMigration, /with term_match_rows as materialized[\s\S]*?terms\.term_kind in \('official_name', 'face_name'\) then 1[\s\S]*?else 2/);
  assert.match(firstResponseMigration, /order by candidates\.match_tier asc, candidates\.match_score desc, candidates\.name/);
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

test("登録画面の短文検索はRLS下でindexableな専用経路を使う", () => {
  assert.match(registrationShortSearch, /language plpgsql/);
  assert.match(registrationShortSearch, /search_registration_cards_long/);
  assert.match(registrationShortSearch, /is_ascii_short/);
  assert.match(registrationShortSearch, /card_number_search text generated always/);
  assert.match(registrationShortSearch, /product_name_search text generated always/);
  assert.match(registrationShortSearch, /operator\(pg_catalog\.~>=~\)/);
  assert.match(registrationShortSearch, /card_prints_canonical_card_id_active_idx/);
});

test("long検索はgenerated columnのtrigram indexを使い短文wrapperを変更しない", () => {
  assert.match(
    registrationLongSearchOptimization,
    /create index(?: if not exists)? card_prints_card_number_search_trgm_active_idx[\s\S]*?card_number_search extensions\.gin_trgm_ops/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /create index(?: if not exists)? card_prints_product_name_search_trgm_active_idx[\s\S]*?product_name_search extensions\.gin_trgm_ops/i,
  );
  assert.match(registrationLongSearchOptimization, /create or replace function public\.search_registration_cards_long/i);
  assert.match(registrationLongSearchOptimization, /create or replace function private\.registration_card_print_candidates/i);
  assert.match(registrationLongSearchOptimization, /security definer/i);
  assert.match(
    registrationLongSearchOptimization,
    /returns table\(canonical_card_id bigint\)[\s\S]*?security definer/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /create or replace function public\.search_registration_cards_long[\s\S]*?security invoker/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /revoke all on function private\.registration_card_print_candidates\(text, text\)\s+from public/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /alter function public\.search_registration_cards_long\(text, text, integer, text\)\s+set schema private/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /revoke all on function private\.search_registration_cards_long\(text, text, integer, text\)\s+from public/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /create or replace function public\.search_registration_cards\([\s\S]*?from private\.search_registration_cards_long\(/i,
  );
  assert.match(
    registrationLongSearchOptimization,
    /create or replace function public\.search_registration_cards\([\s\S]*?if pg_catalog\.char_length\(raw_query\) between 1 and 2[\s\S]*?from public\.card_search_terms as terms[\s\S]*?from public\.card_prints as prints/i,
  );
  assert.doesNotMatch(
    registrationLongSearchOptimization,
    /grant execute on function private\.(?:registration_card_print_candidates|search_registration_cards_long)[^;]*\bto public\b/i,
  );
  assert.match(registrationLongSearchOptimization, /prints\.deleted_at is null/i);
  assert.match(registrationLongSearchOptimization, /from private\.registration_card_print_candidates\(\$1, \$2\)/i);
  assert.match(registrationLongSearchOptimization, /prints\.card_number_search operator\(pg_catalog\.~~\)\s*\('\%' \|\| pg_catalog\.lower\(\$2\) \|\| '\%'/i);
  assert.match(registrationLongSearchOptimization, /prints\.product_name_search operator\(pg_catalog\.~~\)\s*\('\%' \|\| pg_catalog\.lower\(\$2\) \|\| '\%'/i);
  assert.doesNotMatch(registrationLongSearchOptimization, /prints\.(?:card_number|product_name)\s+ilike/i);
  assert.match(registrationShortSearch, /if pg_catalog\.char_length\(raw_query\) between 1 and 2/);
  assert.match(registrationShortSearch, /where is_ascii_short/);
});

test("数字を除外する正規化でも収録番号検索は生入力長でcontains経路を選ぶ", () => {
  assert.match(registrationCardNumberRepair, /char_length\(input\.raw_query\) between 1 and 2/);
  assert.match(registrationCardNumberRepair, /char_length\(input\.raw_query\) >= 3/);
  assert.match(registrationCardNumberRepair, /card_number ilike '%' \|\| input\.raw_query \|\| '%'/);
});

test("登録画面のカード検索は取消・IME中入力・入力から描画までの計測を行う", () => {
  assert.match(register, /rpc\("search_registration_cards"/);
  assert.match(register, /abortSignal\(controller\.signal\)/);
  assert.match(register, /requestSequence !== cardSearchRequestSequence\.current/);
  assert.match(register, /onCompositionStart/);
  assert.match(register, /onCompositionEnd/);
  assert.match(register, /useImeRealtimeInput/);
  assert.doesNotMatch(register, /cardQueryIsComposing\.current/);
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

test("ホーム検索は専用RPCの短文・長文branchを使用し共通検索RPCを変更しない", () => {
  const shortSearchBranch = marketSearchMigration.split("$short_search$")[1];
  const longSearchBranch = marketSearchMigration.split("$long_search$")[1];
  const printCandidateHelper = marketSearchMigration.split("create or replace function public.search_market_cards")[0];
  assert.match(market, /rpc\("search_market_cards"/);
  assert.match(marketSearchMigration, /create or replace function public\.search_market_cards/);
  assert.match(marketSearchMigration, /if pg_catalog\.char_length\(normalized_query\) between 1 and 2 then/);
  assert.match(marketSearchMigration, /return query execute \$short_search\$/);
  assert.match(marketSearchMigration, /return query execute \$long_search\$/);
  assert.match(marketSearchMigration, /normalized_term operator\(extensions\.%\)/);
  assert.match(marketSearchMigration, /card_number_search operator\(pg_catalog\.~~\)/);
  assert.match(marketSearchMigration, /product_name_search operator\(pg_catalog\.~~\)/);
  assert.match(shortSearchBranch, /normalized_term operator\(pg_catalog\.~>=~\)/);
  assert.match(shortSearchBranch, /normalized_term operator\(pg_catalog\.~<~\)/);
  assert.doesNotMatch(shortSearchBranch, /operator\(extensions\.\%\)/);
  assert.doesNotMatch(shortSearchBranch, /operator\(pg_catalog\.~~\)\s*\('%'/);
  assert.match(longSearchBranch, /operator\(pg_catalog\.~~\)\s*\('%'/);
  assert.match(longSearchBranch, /operator\(extensions\.\%\)/);
  assert.match(printCandidateHelper, /function private\.market_card_print_candidates/);
  assert.match(printCandidateHelper, /returns table\(canonical_card_id bigint\)/);
  assert.match(printCandidateHelper, /security definer/i);
  assert.match(marketSearchMigration, /language plpgsql[\s\S]*?security invoker[\s\S]*?search_path = ''/);
  assert.doesNotMatch(marketSearchMigration, /^\s*set pg_trgm\.similarity_threshold/m);
  assert.match(longSearchBranch, /similarity\(terms\.normalized_term, \$1\) >= \$5/);
  assert.doesNotMatch(marketSearchMigration, /create index/i);
  assert.match(marketCompatibilityTest, /search_canonical_cards\(/);
  assert.match(marketCompatibilityTest, /search_market_cards\(/);
  for (const query of ["ボ", "ボル", "ボルシャック", "ギギャイア", "RP3"]) {
    assert.ok(marketCompatibilityTest.includes(query));
  }
});

test("相場検索は入力中も検索し、RPCの画像キーで即描画して追加SELECTを行わない", () => {
  assert.match(market, /\.abortSignal\(controller\.signal\)/);
  assert.match(market, /controller\?\.abort\(\)/);
  assert.match(market, /requestSequence !== searchRequestSequence\.current/);
  assert.match(market, /onCompositionEnd/);
  assert.doesNotMatch(market, /isComposing|from\("card_prints"\)/);
  assert.match(market, /searchStatusKey === currentSearchKey/);
  assert.match(market, /currentSearchStatus === "empty"/);
  assert.match(firstResponseMigration, /drop function if exists public\.search_market_cards/);
  assert.match(firstResponseMigration, /representative\.image_key/);
  assert.match(firstResponseMigration, /left join lateral \([\s\S]*?order by prints\.id/);
});
