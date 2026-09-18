import assert from "node:assert/strict";
import test from "node:test";
import { parseProductionDbArguments, validateProductionDbGuard } from "./production-db-guard.mjs";

const validGit = {
  status: "",
  branch: "main",
  head: "abc",
  remoteHead: "abc",
  remoteUrl: "https://github.com/Motokiyo-DXP/Price_DM.git",
};

test("requires an explicit mode and confirmation", () => {
  assert.throws(() => parseProductionDbArguments(["--push"]), /confirm-production/);
  assert.throws(() => parseProductionDbArguments(["--push", "--dry-run", "--confirm-production"]), /exactly one/);
  assert.deepEqual(parseProductionDbArguments(["--dry-run", "--confirm-production"]), { mode: "--dry-run" });
});

test("accepts only an explicit release session on clean main at price-dm/main", () => {
  assert.deepEqual(validateProductionDbGuard({ environment: { PRICE_DM_PRODUCTION_RELEASE: "1" }, git: validGit }), []);
  const errors = validateProductionDbGuard({
    environment: {},
    git: { ...validGit, status: " M package.json", branch: "feature/safety", head: "old", remoteUrl: "https://example.invalid/other.git" },
  });
  assert.match(errors.join("\n"), /PRICE_DM_PRODUCTION_RELEASE/);
  assert.match(errors.join("\n"), /Working tree/);
  assert.match(errors.join("\n"), /main branch/);
  assert.match(errors.join("\n"), /exactly match/);
  assert.match(errors.join("\n"), /Price_DM repository/);
});
