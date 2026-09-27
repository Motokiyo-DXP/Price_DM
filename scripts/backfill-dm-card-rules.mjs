import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { canonicalizeDuelMastersCard } from "./dm-canonical-equivalents.mjs";
import { isAllowedByRobots, parseCardDetail } from "./import-dm-cards-sample.mjs";

const SOURCE_PATH = ".local/dm-cards-full.jsonl";
const OUTPUT_PATH = ".local/dm-card-rules.jsonl";
const FAILURE_PATH = ".local/dm-card-rules-failures.jsonl";
const MANIFEST_PATH = ".local/dm-card-rules-manifest.json";
const ROBOTS_URL = "https://dm.takaratomy.co.jp/robots.txt";
const MIN_DELAY_MS = 750;

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

export function parseRulesBackfillArguments(argv) {
  const values = new Map(argv.map((argument) => argument.split("=", 2)));
  const delayMs = positiveInteger(values.get("--delay-ms") ?? "1000", "--delay-ms");
  if (delayMs < MIN_DELAY_MS) throw new Error(`--delay-ms cannot be lower than ${MIN_DELAY_MS}.`);
  return {
    delayMs,
    limit: values.has("--limit") ? positiveInteger(values.get("--limit"), "--limit") : null,
  };
}

function recordsFromJsonl(content) {
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

export function officialCardId(officialUrl) {
  try {
    const url = new URL(officialUrl);
    if (url.protocol !== "https:" || url.hostname !== "dm.takaratomy.co.jp" || url.pathname !== "/card/detail/") return null;
    const match = url.search.match(/[?&]id=([^&]+)/u);
    return match ? decodeURIComponent(match[1]).trim() || null : null;
  } catch {
    return null;
  }
}

export function selectPrintSources(cards, completedIds = new Set()) {
  const sources = new Map();
  for (const [index, card] of cards.entries()) {
    if (!card || typeof card !== "object" || typeof card.name !== "string" || !card.name.trim()) {
      throw new Error(`Source record ${index + 1} has no card name.`);
    }
    if (typeof card.official_url !== "string") throw new Error(`Source record ${index + 1} has no official URL.`);
    const id = officialCardId(card.official_url);
    if (!id) throw new Error(`Source record ${index + 1} has an invalid official URL.`);
    if (card.official_card_id !== undefined && card.official_card_id !== id) {
      throw new Error(`Source official ID does not match URL: ${card.official_card_id} / ${id}`);
    }
    const previous = sources.get(id);
    if (previous) {
      const kind = previous.name !== card.name.trim() || previous.official_url !== card.official_url
        ? "Conflicting source records"
        : "Duplicate source record";
      throw new Error(`${kind} for official card ID ${id}.`);
    }
    sources.set(id, { name: card.name.trim(), official_card_id: id, official_url: card.official_url });
  }
  return [...sources.values()].filter((source) => !completedIds.has(source.official_card_id));
}

function createRateLimitedFetcher(delayMs) {
  let nextStartAt = 0;
  return async function fetchOfficialText(url, accept = "text/html,application/xhtml+xml,*/*;q=0.8") {
    const waitMs = Math.max(0, nextStartAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextStartAt = Date.now() + delayMs;
    const response = await fetch(url, {
      headers: {
        accept,
        "user-agent": "TCG-Souba-Checker/0.1 (personal noncommercial card rules metadata backfill)",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      throw new Error(`Official site returned HTTP ${response.status}; stopping this source request.`);
    }
    if (!response.ok) throw new Error(`Official site returned HTTP ${response.status}.`);
    return response.text();
  };
}

async function readOptionalJsonl(path) {
  try {
    return recordsFromJsonl(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function completeRuleIds(records) {
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    const id = record?.official_card_id;
    if (typeof id !== "string" || officialCardId(record.official_url) !== id) {
      throw new Error(`Existing rules record ${index + 1} has an official ID that does not match its URL.`);
    }
    if (typeof record.name !== "string" || !record.name.trim() || !Array.isArray(record.races)
      || record.races.some((race) => typeof race !== "string" || !race.trim())
      || !Array.isArray(record.card_texts) || record.card_texts.length === 0
      || record.card_texts.some((text) => typeof text !== "string")) {
      throw new Error(`Existing rules record ${index + 1} is incomplete.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate existing rules record for official card ID ${id}.`);
    ids.add(id);
  }
  return ids;
}

async function main() {
  const { delayMs, limit } = parseRulesBackfillArguments(process.argv.slice(2));
  await mkdir(".local", { recursive: true });
  const sourceCards = recordsFromJsonl(await readFile(SOURCE_PATH, "utf8"));
  if (sourceCards.length === 0) throw new Error("Official card print source is empty.");
  const previousRecords = await readOptionalJsonl(OUTPUT_PATH);
  const completedIds = completeRuleIds(previousRecords);
  const sources = selectPrintSources(sourceCards);
  const sourcesById = new Map(sources.map((source) => [source.official_card_id, source]));
  for (const record of previousRecords) {
    const source = sourcesById.get(record.official_card_id);
    if (!source || source.official_url !== record.official_url) {
      throw new Error(`Existing rules record does not match the current source print: ${record.official_card_id}`);
    }
    const recordName = canonicalizeDuelMastersCard(record, record.official_card_id).name;
    const sourceName = canonicalizeDuelMastersCard({ name: source.name }, source.official_card_id).name;
    if (recordName !== sourceName) throw new Error(`Existing rules name does not match source print ${record.official_card_id}.`);
  }
  const pending = selectPrintSources(sourceCards, completedIds).slice(0, limit ?? undefined);
  const fetchOfficialText = createRateLimitedFetcher(delayMs);
  const robotsText = await fetchOfficialText(ROBOTS_URL, "text/plain,*/*;q=0.8");
  for (const pathname of ["/card/detail/"]) {
    if (!isAllowedByRobots(robotsText, pathname)) throw new Error(`robots.txt does not allow backfill access to ${pathname}`);
  }

  let succeeded = 0;
  let failed = 0;
  for (const source of pending) {
    let fatalHttpError = false;
    try {
      const parsed = parseCardDetail(await fetchOfficialText(source.official_url), source.official_url);
      const canonical = canonicalizeDuelMastersCard(parsed, source.official_card_id);
      const expected = canonicalizeDuelMastersCard({ name: source.name }, source.official_card_id);
      if (canonical.name !== expected.name) {
        throw new Error(`Parsed name does not match the source print: ${canonical.name} / ${expected.name}`);
      }
      if (!Array.isArray(parsed.races) || !Array.isArray(parsed.card_texts) || parsed.card_texts.length === 0) {
        throw new Error("Official card page did not yield complete face rules data.");
      }
      const record = {
        name: canonical.name,
        official_card_id: source.official_card_id,
        official_url: source.official_url,
        races: parsed.races,
        card_texts: parsed.card_texts,
      };
      await appendFile(OUTPUT_PATH, `${JSON.stringify(record)}\n`, "utf8");
      completedIds.add(source.official_card_id);
      succeeded += 1;
    } catch (error) {
      fatalHttpError = /Official site returned HTTP (?:403|429|5\d\d)/u.test(
        error instanceof Error ? error.message : String(error),
      );
      const failure = {
        name: source.name,
        official_card_id: source.official_card_id,
        official_url: source.official_url,
        error: error instanceof Error ? error.message : String(error),
        checked_at: new Date().toISOString(),
      };
      await appendFile(FAILURE_PATH, `${JSON.stringify(failure)}\n`, "utf8");
      failed += 1;
      console.error(JSON.stringify({ status: "failed", ...failure }));
    }
    if (fatalHttpError) break;
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify({
    source: SOURCE_PATH,
    source_print_count: sources.length,
    rules_print_count: completedIds.size,
    failure_count: failed,
    complete: failed === 0 && completedIds.size === sources.length,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ source_print_count: sources.length, pending: pending.length, succeeded, failed }));
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
