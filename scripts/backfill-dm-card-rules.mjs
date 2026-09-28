import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeDuelMastersCard } from "./dm-canonical-equivalents.mjs";
import { isAllowedByRobots, parseCardDetail } from "./import-dm-cards-sample.mjs";

const SOURCE_PATH = ".local/dm-cards-full.jsonl";
const OUTPUT_PATH = ".local/dm-card-rules.jsonl";
const FAILURE_PATH = ".local/dm-card-rules-failures.jsonl";
const MANIFEST_PATH = ".local/dm-card-rules-manifest.json";
const ROBOTS_URL = "https://dm.takaratomy.co.jp/robots.txt";
const MIN_DELAY_MS = 750;
const MAX_CONSECUTIVE_TRANSPORT_FAILURES = 3;

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

export function parseJsonl(content, label = "JSONL", { repairTrailingPartial = false } = {}) {
  const hasFinalNewline = content.endsWith("\n");
  const lines = content.split(/\r?\n/u);
  if (hasFinalNewline) lines.pop();

  const records = [];
  let repairedTrailingPartial = false;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      const isTrailingPartial = repairTrailingPartial && !hasFinalNewline && index === lines.length - 1;
      if (!isTrailingPartial) {
        throw new Error(`${label} has malformed JSON on line ${index + 1}: ${error.message}`);
      }
      lines.pop();
      repairedTrailingPartial = true;
      break;
    }
  }

  const normalizedContent = repairedTrailingPartial
    ? `${lines.filter(Boolean).join("\n")}${lines.some(Boolean) ? "\n" : ""}`
    : content && !hasFinalNewline ? `${content}\n` : content;
  return { records, normalizedContent, repairedTrailingPartial };
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

async function atomicWriteFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

async function readJsonlFile(path, { optional = false, repairTrailingPartial = false } = {}) {
  try {
    const content = await readFile(path, "utf8");
    const parsed = parseJsonl(content, path, { repairTrailingPartial });
    if (repairTrailingPartial && parsed.normalizedContent !== content) {
      await atomicWriteFile(path, parsed.normalizedContent);
    }
    return parsed.records;
  } catch (error) {
    if (optional && error?.code === "ENOENT") return [];
    throw error;
  }
}

export function completeRuleIds(records) {
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

function newestFailure(previous, candidate) {
  const previousTime = Date.parse(previous?.checked_at ?? "");
  const candidateTime = Date.parse(candidate?.checked_at ?? "");
  return Number.isFinite(previousTime) && Number.isFinite(candidateTime)
    ? candidateTime >= previousTime ? candidate : previous
    : candidate;
}

export function reconcileFailureRecords(records, completedIds, sourcesById) {
  const failuresById = new Map();
  for (const [index, failure] of records.entries()) {
    const id = failure?.official_card_id;
    const source = sourcesById.get(id);
    if (typeof id !== "string" || officialCardId(failure?.official_url) !== id
      || typeof failure?.error !== "string" || !failure.error.trim()) {
      throw new Error(`Failure record ${index + 1} has an invalid official card identity or error.`);
    }
    if (!source || source.official_url !== failure.official_url || source.name !== failure.name) {
      throw new Error(`Failure record does not match the current source print: ${id}`);
    }
    if (completedIds.has(id)) continue;
    failuresById.set(id, newestFailure(failuresById.get(id), failure));
  }
  return failuresById;
}

export function buildRulesBackfillManifest(sourceCount, completedIds, failuresById, updatedAt = new Date().toISOString()) {
  const successCount = completedIds.size;
  const failureCount = failuresById.size;
  const pendingCount = sourceCount - successCount - failureCount;
  if (pendingCount < 0) throw new Error("Rules backfill state exceeds the source print count.");
  return {
    source: SOURCE_PATH,
    source_print_count: sourceCount,
    rules_print_count: successCount,
    failure_count: failureCount,
    pending_print_count: pendingCount,
    complete: pendingCount === 0 && failureCount === 0 && successCount === sourceCount,
    updated_at: updatedAt,
  };
}

export function isTransportFailure(error) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /fetch failed|timeout|timed out|aborterror|econn|enotfound|eai_again|socket|connection reset|network error/iu.test(message);
}

function shouldStopForHttpError(error) {
  return /Official site returned HTTP (?:403|429|5\d\d)/u.test(error instanceof Error ? error.message : String(error));
}

export function createGracefulStopController(eventTarget = process) {
  let requestedSignal = null;
  const onSigint = () => { requestedSignal ??= "SIGINT"; };
  const onSigterm = () => { requestedSignal ??= "SIGTERM"; };
  eventTarget.on("SIGINT", onSigint);
  eventTarget.on("SIGTERM", onSigterm);
  return {
    get requestedSignal() { return requestedSignal; },
    shouldStop() { return requestedSignal !== null; },
    dispose() {
      eventTarget.removeListener("SIGINT", onSigint);
      eventTarget.removeListener("SIGTERM", onSigterm);
    },
  };
}

export async function runRulesBackfillWorklist({
  worklist,
  completedIds,
  failuresById,
  fetchRecord,
  appendSuccess,
  persist,
  shouldStop = () => false,
  limit = null,
  log = () => {},
}) {
  let succeeded = 0;
  let failed = 0;
  let attempted = 0;
  let consecutiveTransportFailures = 0;
  let stopReason = null;
  for (const source of worklist.slice(0, limit ?? undefined)) {
    if (shouldStop()) {
      stopReason = "signal";
      break;
    }
    attempted += 1;
    let record;
    try {
      record = await fetchRecord(source);
      if (record?.official_card_id !== source.official_card_id || record?.official_url !== source.official_url) {
        throw new Error(`Fetched rules record does not match source print ${source.official_card_id}.`);
      }
      await appendSuccess(record);
    } catch (error) {
      const failure = {
        name: source.name,
        official_card_id: source.official_card_id,
        official_url: source.official_url,
        error: error instanceof Error ? error.message : String(error),
        checked_at: new Date().toISOString(),
      };
      failuresById.set(source.official_card_id, failure);
      failed += 1;
      await persist();
      log({ status: "failed", ...failure });
      if (shouldStopForHttpError(error)) {
        stopReason = "http";
        break;
      }
      if (isTransportFailure(error)) {
        consecutiveTransportFailures += 1;
        if (consecutiveTransportFailures >= MAX_CONSECUTIVE_TRANSPORT_FAILURES) {
          stopReason = "consecutive_transport_failures";
          break;
        }
      } else {
        consecutiveTransportFailures = 0;
      }
      continue;
    }
    completedIds.add(source.official_card_id);
    failuresById.delete(source.official_card_id);
    succeeded += 1;
    consecutiveTransportFailures = 0;
    await persist();
    log({ status: "success", official_card_id: source.official_card_id });
  }
  await persist();
  return { attempted, succeeded, failed, stopReason, consecutiveTransportFailures };
}

export function buildRulesBackfillWorklist(sources, completedIds, failuresById, limit = null) {
  const unresolved = new Set(failuresById.keys());
  const pending = sources.filter((source) => !completedIds.has(source.official_card_id));
  const ordered = [
    ...pending.filter((source) => unresolved.has(source.official_card_id)),
    ...pending.filter((source) => !unresolved.has(source.official_card_id)),
  ];
  return ordered.slice(0, limit ?? undefined);
}

async function main() {
  const { delayMs, limit } = parseRulesBackfillArguments(process.argv.slice(2));
  const stopController = createGracefulStopController();
  await mkdir(".local", { recursive: true });
  try {
    const sourceCards = await readJsonlFile(SOURCE_PATH);
    if (sourceCards.length === 0) throw new Error("Official card print source is empty.");
    const sources = selectPrintSources(sourceCards);
    const sourcesById = new Map(sources.map((source) => [source.official_card_id, source]));
    const previousRecords = await readJsonlFile(OUTPUT_PATH, { optional: true, repairTrailingPartial: true });
    const completedIds = completeRuleIds(previousRecords);
    for (const record of previousRecords) {
      const source = sourcesById.get(record.official_card_id);
      if (!source || source.official_url !== record.official_url) {
        throw new Error(`Existing rules record does not match the current source print: ${record.official_card_id}`);
      }
      const recordName = canonicalizeDuelMastersCard(record, record.official_card_id).name;
      const sourceName = canonicalizeDuelMastersCard({ name: source.name }, source.official_card_id).name;
      if (recordName !== sourceName) throw new Error(`Existing rules name does not match source print ${record.official_card_id}.`);
    }
    const failureRecords = await readJsonlFile(FAILURE_PATH, { optional: true, repairTrailingPartial: true });
    const failuresById = reconcileFailureRecords(failureRecords, completedIds, sourcesById);

    const persist = async () => {
      const orderedFailures = [...failuresById.values()].sort((a, b) =>
        sourcesById.get(a.official_card_id).official_url.localeCompare(sourcesById.get(b.official_card_id).official_url));
      await atomicWriteFile(FAILURE_PATH, orderedFailures.map((record) => JSON.stringify(record)).join("\n")
        + (orderedFailures.length ? "\n" : ""));
      const manifest = buildRulesBackfillManifest(sources.length, completedIds, failuresById);
      await atomicWriteFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    };

    await persist();
    const fetchOfficialText = createRateLimitedFetcher(delayMs);
    const robotsText = await fetchOfficialText(ROBOTS_URL, "text/plain,*/*;q=0.8");
    if (!isAllowedByRobots(robotsText, "/card/detail/")) {
      throw new Error("robots.txt does not allow backfill access to /card/detail/");
    }

    const worklist = buildRulesBackfillWorklist(sources, completedIds, failuresById, limit);
    const result = await runRulesBackfillWorklist({
      worklist,
      completedIds,
      failuresById,
      fetchRecord: async (source) => {
        const parsed = parseCardDetail(await fetchOfficialText(source.official_url), source.official_url);
        const canonical = canonicalizeDuelMastersCard(parsed, source.official_card_id);
        const expected = canonicalizeDuelMastersCard({ name: source.name }, source.official_card_id);
        if (canonical.name !== expected.name) {
          throw new Error(`Parsed name does not match the source print: ${canonical.name} / ${expected.name}`);
        }
        if (!Array.isArray(parsed.races) || !Array.isArray(parsed.card_texts) || parsed.card_texts.length === 0) {
          throw new Error("Official card page did not yield complete face rules data.");
        }
        return {
          name: canonical.name,
          official_card_id: source.official_card_id,
          official_url: source.official_url,
          races: parsed.races,
          card_texts: parsed.card_texts,
        };
      },
      appendSuccess: async (record) => appendFile(OUTPUT_PATH, `${JSON.stringify(record)}\n`, "utf8"),
      persist,
      shouldStop: stopController.shouldStop,
      limit,
      log: (entry) => console.log(JSON.stringify(entry)),
    });
    const manifest = buildRulesBackfillManifest(sources.length, completedIds, failuresById);
    console.log(JSON.stringify({ ...result, ...manifest }));
    if (stopController.requestedSignal) process.exitCode = stopController.requestedSignal === "SIGINT" ? 130 : 143;
    else if (!manifest.complete) process.exitCode = 1;
  } finally {
    stopController.dispose();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
