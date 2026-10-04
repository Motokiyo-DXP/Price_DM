import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/deck-editor.tsx", import.meta.url), "utf8");

test("mobile civilization shortcuts are hidden while popup controls remain", () => {
  const civilizationRules = css.match(/\.deck-search-civilizations\.deck-civilization-buttons\{[^}]*\}/g) ?? [];
  const responsiveRows = civilizationRules.filter((rule) => rule.includes("flex:0 0 auto"));

  assert.equal(responsiveRows.length, 2);
  assert.ok(responsiveRows.every((rule) => rule.includes("display:none")));
  assert.ok(editor.includes('className="deck-filter-buttons deck-civilization-buttons"'));
});

test("mobile deck preview fits eight columns and five rows within the canvas", () => {
  const mobileGridRule = css.match(/\.deck-maker-canvas>\.deck-maker-grid\{[^}]*\}/)?.[0];

  assert.ok(mobileGridRule);
  assert.match(mobileGridRule, /grid-template-columns:repeat\(8,var\(--deck-preview-card-width\)\)/);
  assert.ok(mobileGridRule.includes("(100cqw - 7 * var(--deck-preview-gap))/8"));
  assert.ok(mobileGridRule.includes("(100cqh - 4 * var(--deck-preview-gap))/7"));
});
