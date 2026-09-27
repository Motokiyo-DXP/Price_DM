import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("DM26-RP3 reading migration resolves canonical targets by active Duel Masters card name", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migration = await readFile(
    path.join(here, "..", "supabase", "migrations", "20260923212249_dm26rp3_name_readings.sql"),
    "utf8",
  );
  const investigationSource = migration.match(
    /insert into original01_investigation_reading_source\(card_name, reading, source_url\) values[\s\S]*?;/u,
  )?.[0];

  assert.ok(investigationSource, "investigation reading source insert exists");
  assert.doesNotMatch(migration, /\b(?:43753|43693)\b/u);
  assert.doesNotMatch(migration, /(?:cards|source|stale_name)\.id\s*=\s*\d+/u);
  assert.doesNotMatch(migration, /canonical_card_id\s*=\s*\d+/u);
  assert.doesNotMatch(investigationSource, /^\s*\(\d+\s*,/mu);
  assert.match(migration, /insert into dm26rp3_name_correction_target\(canonical_card_id\)[\s\S]*?select cards\.id/u);
  assert.match(migration, /if \(select count\(\*\) from dm26rp3_name_correction_target\) <> 1 then/u);
  assert.match(migration, /games\.slug = 'duel-masters'/u);
  assert.match(migration, /cards\.name = source\.card_name/u);
  assert.match(migration, /cards\.deleted_at is null/u);
  assert.match(migration, /having count\(distinct cards\.id\) <> 1/u);
  assert.match(migration, /count\(distinct card_name\) from original01_investigation_reading_source\) <> 52/u);
  assert.match(migration, /DM26-RP3 investigated reading canonical mapping mismatch/u);
  assert.match(migration, /DM26-RP3 card-name correction target mismatch/u);
  assert.match(migration, /source\.card_name = 'キング∞エンペラー'/u);
});
