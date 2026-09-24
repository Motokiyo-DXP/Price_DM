import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isImeCompositionEnter } from "./use-ime-realtime-input.ts";

const registration = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("./use-ime-realtime-input.ts", import.meta.url), "utf8");

test("IME composition Enter is blocked while ordinary Enter remains available", () => {
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: { isComposing: true } }), true);
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: { keyCode: 229 } }), true);
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: {} }, true), true);
  assert.equal(isImeCompositionEnter({ key: "Enter", nativeEvent: {} }), false);
  assert.equal(isImeCompositionEnter({ key: "ArrowDown", nativeEvent: { isComposing: true } }), false);
  assert.match(registration, /isImeCompositionEnter\(event, shopSearchInput\.isComposing\(\)\)[\s\S]*event\.preventDefault\(\)/);
});

test("registration shop search waits for compositionend and retriggers for the same query", () => {
  assert.match(hook, /onChange[\s\S]*setValue\(event\.currentTarget\.value\)/);
  assert.match(hook, /onCompositionEnd[\s\S]*setValue\(event\.currentTarget\.value\)/);
  assert.match(registration, /const \[shopQueryCompositionRevision, setShopQueryCompositionRevision\] = useState\(0\)/);
  assert.match(registration, /if \(shopSearchInput\.isComposing\(\)\) \{\s*setSearchingShops\(false\);\s*return;/);
  assert.match(registration, /\[selectedShop, shopPrefecture, searchShopQuery, shopQueryCompositionRevision\]/);
  assert.match(registration, /onCompositionEnd=\{\(event\) => \{\s*shopSearchInput\.onCompositionEnd\(event\);\s*setShopQueryCompositionRevision\(\(current\) => current \+ 1\);/);
});

test("registration shop search retains stale-response, prefecture, and Enter selection behavior", () => {
  assert.match(registration, /p_prefecture: shopPrefecture \|\| undefined/);
  assert.match(registration, /if \(cancelled\) return;[\s\S]*setShopOptions\(page\.options\)/);
  assert.match(registration, /event\.key === "Enter" && shopSuggestionsOpen\)[\s\S]*activeShopOptionIndex >= 0 \? activeShopOptionIndex : 0/);
  assert.match(registration, /function chooseShop\(shop: RegistrationShopOption\) \{\s*setSelectedShop\(shop\);/);
});
