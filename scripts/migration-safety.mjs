import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_FILE = /^(?<timestamp>\d{14})_(?<name>.+)\.sql$/;
const HISTORY_MARKER = /(?:history|external).*marker/i;

function withoutSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").trim();
}

export function validateMigrationEntries(entries) {
  const errors = [];
  const filenames = new Set();
  const timestamps = new Map();

  for (const entry of entries) {
    if (filenames.has(entry.filename)) errors.push(`Duplicate migration filename: ${entry.filename}`);
    filenames.add(entry.filename);

    const match = MIGRATION_FILE.exec(entry.filename);
    if (!match) {
      errors.push(`Invalid migration filename: ${entry.filename}`);
      continue;
    }

    const { timestamp } = match.groups;
    const previous = timestamps.get(timestamp);
    if (previous) errors.push(`Duplicate migration timestamp ${timestamp}: ${previous}, ${entry.filename}`);
    timestamps.set(timestamp, entry.filename);

    if (HISTORY_MARKER.test(entry.filename) && withoutSqlComments(entry.contents)) {
      errors.push(`History marker must not contain executable SQL: ${entry.filename}`);
    }
  }

  return errors;
}

export async function validateMigrationDirectory(directory) {
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".sql"));
  const entries = await Promise.all(filenames.map(async (filename) => ({
    filename,
    contents: await readFile(path.join(directory, filename), "utf8"),
  })));
  return validateMigrationEntries(entries);
}
