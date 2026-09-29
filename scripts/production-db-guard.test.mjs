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

test("guard accepts include-all only when explicitly requested", () => {
  assert.deepEqual(parseProductionDbArguments(["--dry-run", "--include-all", "--confirm-production"]), {
    mode: "--dry-run",
    includeAll: true,
  });
  assert.deepEqual(parseProductionDbArguments(["--push", "--include-all", "--confirm-production"]), {
    mode: "--push",
    includeAll: true,
  });
  assert.deepEqual(parseProductionDbArguments(["--dry-run", "--confirm-production"]), { mode: "--dry-run" });
});

test("requires one explicit mode and production confirmation, and rejects unknown arguments", () => {
  assert.throws(() => parseProductionDbArguments(["--push"]), /confirm-production/);
  assert.throws(() => parseProductionDbArguments(["--push", "--dry-run", "--confirm-production"]), /exactly one/);
  assert.throws(() => parseProductionDbArguments(["--dry-run", "--include-all"]), /confirm-production/);
  assert.throws(() => parseProductionDbArguments(["--dry-run", "--confirm-production", "--include-alll"]), /exactly one/);
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
