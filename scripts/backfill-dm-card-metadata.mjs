import { appendFile, mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parseCardDetail } from "./import-dm-cards-sample.mjs";

const SOURCE_PATH = ".local/dm-cards-full.jsonl";
const OUTPUT_PATH = ".local/dm-card-metadata.jsonl";
const FAILURE_PATH = ".local/dm-card-metadata-failures.jsonl";
const MIN_DELAY_MS = 750;

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

export function parseBackfillArguments(argv) {
  const values = new Map(argv.map((argument) => argument.split("=", 2)));
  const delayMs = positiveInteger(values.get("--delay-ms") ?? "750", "--delay-ms");
  if (delayMs < MIN_DELAY_MS) throw new Error(`--delay-ms cannot be lower than ${MIN_DELAY_MS}.`);
  return {
    concurrency: positiveInteger(values.get("--concurrency") ?? "4", "--concurrency"),
    delayMs,
    limit: values.has("--limit") ? positiveInteger(values.get("--limit"), "--limit") : null,
  };
}

function recordsFromJsonl(content) {
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

export function selectCanonicalSources(cards, completedNames = new Set()) {
  const sources = new Map();
  for (const card of cards) {
    if (typeof card?.name !== "string" || typeof card?.official_url !== "string") continue;
    const name = card.name.trim();
    if (!name || completedNames.has(name)) continue;
    const source = sources.get(name) ?? { name, officialUrls: [] };
    if (!source.officialUrls.includes(card.official_url)) source.officialUrls.push(card.official_url);
    sources.set(name, source);
  }
  return [...sources.values()];
}

function createRateLimitedFetcher(delayMs) {
  let nextStartAt = 0;
  let queue = Promise.resolve();
  return async function fetchDetail(url) {
    let release;
    const turn = queue;
    queue = new Promise((resolve) => { release = resolve; });
    await turn;
    const waitMs = Math.max(0, nextStartAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextStartAt = Date.now() + delayMs;
    release();

    const response = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8", "user-agent": "TCG-Souba-Checker/0.1 (personal noncommercial card metadata index)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function main() {
  const { concurrency, delayMs, limit } = parseBackfillArguments(process.argv.slice(2));
  await mkdir(".local", { recursive: true });
  const cards = recordsFromJsonl(await readFile(SOURCE_PATH, "utf8"));
  const completed = new Set(
    recordsFromJsonl(await readOptional(OUTPUT_PATH))
      .filter((record) => Object.hasOwn(record, "cost") && Array.isArray(record.civilizations))
      .map((record) => record.name),
  );
  const pending = selectCanonicalSources(cards, completed).slice(0, limit ?? undefined);
  const fetchDetail = createRateLimitedFetcher(delayMs);
  let cursor = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const source = pending[index];
      try {
        let parsed = null;
        let successfulUrl = null;
        let lastError = null;
        for (const officialUrl of source.officialUrls) {
          try {
            const html = await fetchDetail(officialUrl);
            parsed = parseCardDetail(html, officialUrl);
            successfulUrl = officialUrl;
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!parsed || !successfulUrl) throw lastError ?? new Error("No usable official print URL.");
        await appendFile(OUTPUT_PATH, `${JSON.stringify({ name: source.name, cost: parsed.cost, civilizations: parsed.civilizations, card_types: parsed.card_types, official_url: successfulUrl })}\n`, "utf8");
        succeeded += 1;
      } catch (error) {
        await appendFile(FAILURE_PATH, `${JSON.stringify({ name: source.name, official_urls: source.officialUrls, error: error instanceof Error ? error.message : String(error), checked_at: new Date().toISOString() })}\n`, "utf8");
        failed += 1;
      }
      if ((succeeded + failed) % 100 === 0 || succeeded + failed === pending.length) {
        console.log(JSON.stringify({ completed: succeeded + failed, failed, remaining: pending.length - succeeded - failed, succeeded, total: pending.length }));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, () => worker()));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
