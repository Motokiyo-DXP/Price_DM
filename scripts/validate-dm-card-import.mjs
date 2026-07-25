import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const CARD_PATH = ".local/dm-cards-full.jsonl";
const CHECKPOINT_PATH = ".local/dm-cards-full-checkpoint.json";
const FAILURES_PATH = ".local/dm-cards-full-failures.json";
const FORBIDDEN_FIELDS = new Set([
  "card_text",
  "effect_text",
  "flavor_text",
  "image",
  "image_url",
  "price",
]);

function officialCardId(record) {
  try {
    const url = new URL(record.official_url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "dm.takaratomy.co.jp" ||
      url.pathname !== "/card/detail/"
    ) {
      return null;
    }
    return url.searchParams.get("id")?.trim() || null;
  } catch {
    return null;
  }
}

export function validateCardCatalog(records, checkpoint, failures = []) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Official card catalog is empty.");
  }
  if (!checkpoint || typeof checkpoint !== "object") {
    throw new Error("Official card checkpoint is missing.");
  }
  const ids = new Set();
  const names = new Set();
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object") {
      throw new Error(`Card ${index + 1} is not an object.`);
    }
    if (typeof record.name !== "string" || !record.name.trim()) {
      throw new Error(`Card ${index + 1} has no name.`);
    }
    const id = officialCardId(record);
    if (!id) throw new Error(`Card ${index + 1} has an invalid official URL.`);
    if (ids.has(id)) throw new Error(`Duplicate official card id: ${id}`);
    ids.add(id);
    names.add(record.name.trim());

    const forbidden = Object.keys(record).find((key) => FORBIDDEN_FIELDS.has(key));
    if (forbidden) {
      throw new Error(`Card ${index + 1} contains forbidden field: ${forbidden}`);
    }
  }

  const pendingFailures = Array.isArray(failures) ? failures.length : 0;
  if (checkpoint.complete) {
    if (!checkpoint.crawl_complete) {
      throw new Error("Checkpoint is complete but crawl_complete is false.");
    }
    if (pendingFailures > 0 || checkpoint.failures_pending !== 0) {
      throw new Error("Official card crawl still has pending failures.");
    }
    if (
      Number.isSafeInteger(checkpoint.total_available) &&
      checkpoint.total_available !== records.length
    ) {
      throw new Error(
        `Catalog count mismatch: ${records.length}/${checkpoint.total_available}`,
      );
    }
  }

  return {
    card_print_count: records.length,
    canonical_name_count: names.size,
    duplicate_official_id_count: 0,
    pending_failure_count: pendingFailures,
    complete: checkpoint.complete === true,
    total_available: checkpoint.total_available ?? null,
    forbidden_fields_present: false,
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function main() {
  const [content, checkpoint, failures] = await Promise.all([
    readFile(CARD_PATH, "utf8"),
    readJson(CHECKPOINT_PATH, null),
    readJson(FAILURES_PATH, []),
  ]);
  const records = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(
    JSON.stringify(validateCardCatalog(records, checkpoint, failures), null, 2),
  );
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
