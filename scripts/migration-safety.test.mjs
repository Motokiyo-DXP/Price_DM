import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateMigrationDirectory, validateMigrationEntries } from "./migration-safety.mjs";

test("rejects duplicate timestamps and malformed migration names", () => {
  const errors = validateMigrationEntries([
    { filename: "20260919120000_first.sql", contents: "select 1;" },
    { filename: "20260919120000_second.sql", contents: "select 2;" },
    { filename: "not-a-migration.sql", contents: "select 3;" },
  ]);
  assert.match(errors.join("\n"), /Duplicate migration timestamp/);
  assert.match(errors.join("\n"), /Invalid migration filename/);
});

test("rejects duplicate migration filenames", () => {
  const errors = validateMigrationEntries([
    { filename: "20260919120000_once.sql", contents: "select 1;" },
    { filename: "20260919120000_once.sql", contents: "select 1;" },
  ]);
  assert.match(errors.join("\n"), /Duplicate migration filename/);
});

test("rejects executable SQL in history markers", () => {
  const errors = validateMigrationEntries([
    { filename: "20260919120000_history_marker.sql", contents: "-- marker\ncreate table unsafe ();" },
  ]);
  assert.deepEqual(errors, ["History marker must not contain executable SQL: 20260919120000_history_marker.sql"]);
});

test("current migration directory has unique versions and comment-only markers", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const errors = await validateMigrationDirectory(path.join(here, "..", "supabase", "migrations"));
  assert.deepEqual(errors, []);
});
