import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatJapaneseDate } from "./japanese-date.ts";
import { getVisiblePrimaryNavigationPath } from "./primary-navigation.ts";

test("home and deck-search keep the primary navigation absent in both initial renders", () => {
  for (const route of ["/", "/deck-search"]) {
    assert.equal(getVisiblePrimaryNavigationPath(route, false), null);
    assert.equal(getVisiblePrimaryNavigationPath(route, true), route);
  }
  assert.equal(getVisiblePrimaryNavigationPath("/register", false), null);
  assert.equal(getVisiblePrimaryNavigationPath("/register", true), null);
});

test("PrimaryNavigation uses the mounted guard for its route-dependent markup", async () => {
  const source = await readFile(new URL("../components/primary-navigation.tsx", import.meta.url), "utf8");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /getVisiblePrimaryNavigationPath\(pathname, mounted\)/);
});

test("public deck dates stay on the Japanese timezone across UTC midnight", () => {
  assert.equal(formatJapaneseDate("2026-09-17T22:08:45.956+00:00"), "2026/9/18");
});
