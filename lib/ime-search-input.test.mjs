import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createImeSelectionGuard, isImeCompositionEnter } from "./use-ime-realtime-input.ts";

const hook = readFileSync(new URL("./use-ime-realtime-input.ts", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/deck-editor.tsx", import.meta.url), "utf8");
const market = readFileSync(new URL("../components/market-list.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");
const shopMetadata = readFileSync(new URL("../components/admin-shop-search-metadata-form.tsx", import.meta.url), "utf8");
const files = [
  deck,
  market,
  register,
  readFileSync(new URL("../components/public-deck-search.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/my-decks-browser.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/admin-shop-details-form.tsx", import.meta.url), "utf8"),
  shopMetadata,
];

test("IME input updates use the visible value during composition and sync a changed final value", () => {
  assert.match(hook, /onChange[\s\S]*setValue\(event\.currentTarget\.value\)/);
  assert.match(hook, /onCompositionEnd[\s\S]*setValue\(event\.currentTarget\.value\)/);
  assert.match(hook, /if \(valueRef\.current === nextValue\) return/);
  for (const source of files) {
    assert.match(source, /useImeRealtimeInput/);
    assert.match(source, /onCompositionStart/);
    assert.match(source, /onCompositionEnd/);
  }
  assert.match(deck, /const normalizedQuery = normalizeJapaneseSearch\(query\);\s*const searchQuery = useMemo\(\(\) => query\.trim\(\), \[normalizedQuery\]\)/);
  assert.match(deck, /const normalizedCardNumberFilter = cardNumberFilter\.trim\(\)\.toLowerCase\(\);\s*const searchCardNumberFilter = useMemo\(\(\) => cardNumberFilter\.trim\(\), \[normalizedCardNumberFilter\]\)/);
  assert.match(market, /const normalizedQuery = normalizeJapaneseSearch\(query\);\s*const searchQuery = useMemo\(\(\) => query\.trim\(\), \[normalizedQuery\]\)/);
  assert.match(register, /const normalizedCardQuery = normalizeJapaneseSearch\(cardQuery\);[\s\S]*const searchCardQuery = useMemo\(\(\) => cardQuery\.trim\(\), \[normalizedCardQuery\]\)/);
  assert.match(register, /const normalizedShopQuery = normalizeShopSearch\(shopQuery\);[\s\S]*const searchShopQuery = useMemo\(\(\) => shopQuery\.trim\(\), \[normalizedShopQuery\]\)/);
  assert.match(register, /normalizeShopSearch\(event\.currentTarget\.value\) !== normalizedShopQuery/);
  assert.doesNotMatch(deck, /if \(isComposing\) return/);
  assert.doesNotMatch(market, /if \(isComposing\)/);
  assert.doesNotMatch(register, /cardQueryIsComposing\.current/);
});

test("IME conversion Enter is blocked before registration selection or form submission", () => {
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: { isComposing: true } }), true);
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: { keyCode: 229 } }), true);
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: {} }, true), true);
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: {} }), false);
  assert.equal(isImeCompositionEnter({ key: "ArrowDown", nativeEvent: { isComposing: true } }), false);
  assert.match(register, /isImeCompositionEnter\(event, cardSearchInput\.isComposing\(\)\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(register, /isImeCompositionEnter\(event, shopSearchInput\.isComposing\(\)\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(register, /isImeCompositionEnter\(event, salePriceIsComposing\.current\)\) event\.preventDefault\(\)/);
  assert.match(register, /isImeCompositionEnter\(event, buyPriceIsComposing\.current\)\) event\.preventDefault\(\)/);
  assert.match(deck, /isImeCompositionEnter\(event, cardSearchInput\.isComposing\(\)\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(deck, /isImeCompositionEnter\(event, cardNumberSearchInput\.isComposing\(\)\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(shopMetadata, /isImeCompositionEnter\(event, shopFilterInput\.isComposing\(\)\)[\s\S]*event\.preventDefault\(\)/);
});

test("asynchronous search results are invalidated after newer input, including secondary images", () => {
  assert.match(deck, /searchControllerRef\.current\?\.abort\(\)/);
  assert.match(deck, /requestId !== searchRequestRef\.current \|\| signal\.aborted/);
  assert.match(market, /controller\?\.abort\(\)/);
  assert.match(market, /requestSequence !== searchRequestSequence\.current/);
  assert.match(register, /controller\.signal\.aborted/);
  assert.match(register, /requestSequence !== shopSearchRequestSequence\.current/);
  assert.match(register, /if \(requestSequence !== shopSearchRequestSequence\.current\) return;/);
});

test("店舗IME確定は同一queryでも再検索し、最新結果とEnter選択を維持する", () => {
  assert.match(register, /const \[shopQueryCompositionRevision, setShopQueryCompositionRevision\] = useState\(0\)/);
  assert.match(register, /\[selectedShop, shopPrefecture, searchShopQuery, shopQueryCompositionRevision\]/);
  assert.match(register, /onCompositionEnd=\{\(event\) => \{\s*if \(!shopSearchInput\.onCompositionEnd\(event\)\) return;\s*setShopQueryCompositionRevision\(\(current\) => current \+ 1\);/);
  assert.match(register, /p_prefecture: shopPrefecture \|\| undefined/);
  assert.match(register, /if \(requestSequence !== shopSearchRequestSequence\.current\) return;[\s\S]*setShopOptions\(page\.options\)/);
  assert.match(register, /event\.key === "Enter" && shopSuggestionsOpen\)[\s\S]*activeIndex: activeShopOptionIndex[\s\S]*options: shopOptions/);
});


test("explicit selection rejects delayed compositionend/input/change until the next edit", () => {
  for (const selected of ["カイザー・ルピア", "店舗名", ""]) {
    const guard = createImeSelectionGuard();
    const input = { value: "変換途中" };
    assert.equal(guard.accept(input), true);
    guard.commit(selected);
    for (const event of ["compositionend", "input", "change"]) {
      input.value = "かいざーるぴあ";
      assert.equal(guard.accept(input), false, event);
      assert.equal(input.value, selected);
    }
    guard.resume();
    for (const value of ["abc123", "日本語", "確定した日本語"]) {
      input.value = value;
      assert.equal(guard.accept(input), true);
      assert.equal(input.value, value);
    }
  }
});

test("card, shop and product selection share commit and pointer plus keyboard click paths", () => {
  assert.match(register, /cardSearchInput\.commitSelection\(card.name\)/);
  assert.match(register, /shopSearchInput\.commitSelection\(shop.name\)/);
  for (const kind of ["Card", "Shop"]) {
    assert.match(register, new RegExp("onPointerDown=\\{[\\s\\S]*choose" + kind));
    assert.match(register, new RegExp("onClick=\\{\\(event\\) => \\{ if \\(event.detail === 0\\) choose" + kind));
  }
  assert.match(deck, /productSearchInput\.commitSelection\(""\)/);
  assert.match(deck, /key=\{name\} onPointerDown=/);
  assert.doesNotMatch(deck, /cardSearchInput\.commitSelection/);
  assert.match(hook, /selectionGuard.current.commit\(nextValue\);[\s\S]*inputRef.current\?\.blur\(\)/);
});


test("late events cannot clear selected card/shop or reopen product suggestions", () => {
  for (const name of ["card", "shop"]) {
    assert.match(register, new RegExp("if \\(!" + name + "SearchInput.onCompositionEnd\\(event\\)\\) return;"));
    assert.match(register, new RegExp("onInput=\\{" + name + "SearchInput.onInput\\}"));
    assert.match(register, new RegExp("onChange=\\{\\(event\\) => \\{\\s*if \\(!" + name + "SearchInput.onChange\\(event\\)\\) return;"));
  }
  assert.match(deck, /if \(!productSearchInput.onChange\(event\)\) return; setProductListOpen\(true\)/);
});
