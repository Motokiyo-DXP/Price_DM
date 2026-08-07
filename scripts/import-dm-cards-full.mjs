import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";

import {
  isAllowedByRobots,
  parseCardDetail,
  parseCardList,
} from "./import-dm-cards-sample.mjs";
import { buildCardSearchMetadata } from "./lib/dm-card-readings.mjs";

const BASE_URL = "https://dm.takaratomy.co.jp";
const CARD_SEARCH_URL = `${BASE_URL}/card/`;
const ROBOTS_URL = `${BASE_URL}/robots.txt`;
const USER_AGENT =
  "TCG-Souba-Checker/0.1 (personal noncommercial card index; no images or card text)";
const DEFAULT_DELAY_MS = 1_000;
const MIN_DELAY_MS = 750;
const OUTPUT_PATH = ".local/dm-cards-full.jsonl";
const CHECKPOINT_PATH = ".local/dm-cards-full-checkpoint.json";
const FAILURES_PATH = ".local/dm-cards-full-failures.json";
const UNAVAILABLE_PATH = ".local/dm-cards-full-unavailable.json";

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseFullImportArguments(argv) {
  const values = new Map(
    argv.map((argument) => {
      const [key, value] = argument.split("=", 2);
      return [key, value];
    }),
  );
  const delayMs = positiveInteger(
    values.get("--delay-ms") ?? String(DEFAULT_DELAY_MS),
    "--delay-ms",
  );
  if (delayMs < MIN_DELAY_MS) {
    throw new Error(`--delay-ms cannot be lower than ${MIN_DELAY_MS}.`);
  }

  return {
    delayMs,
    maxPages: values.has("--max-pages")
      ? positiveInteger(values.get("--max-pages"), "--max-pages")
      : null,
    startPage: values.has("--start-page")
      ? positiveInteger(values.get("--start-page"), "--start-page")
      : null,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function resolveTotalAvailable(previousTotal, observedTotal) {
  return Number.isSafeInteger(observedTotal) && observedTotal > 0
    ? observedTotal
    : previousTotal;
}

function createRateLimitedFetcher(delayMs) {
  let lastRequestAt = 0;
  return async function fetchText(url, options = {}) {
    const waitMs = Math.max(0, lastRequestAt + delayMs - Date.now());
    if (waitMs) await sleep(waitMs);
    lastRequestAt = Date.now();

    const response = await fetch(url, {
      ...options,
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "user-agent": USER_AGENT,
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      throw new Error(`Official site returned HTTP ${response.status}; import stopped safely.`);
    }
    if (!response.ok) throw new Error(`Official site returned HTTP ${response.status}.`);
    return response.text();
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

export function deduplicateCardOutput(content) {
  const rawLines = content.split(/\r?\n/);
  const records = new Map();
  let malformedTrailingRecord = false;
  let nonEmptyIndex = 0;
  const nonEmptyLines = rawLines.filter(Boolean);
  for (const line of nonEmptyLines) {
    nonEmptyIndex += 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      if (nonEmptyIndex === nonEmptyLines.length) {
        malformedTrailingRecord = true;
        continue;
      }
      throw error;
    }
    if (
      !record ||
      typeof record !== "object" ||
      typeof record.official_url !== "string" ||
      !record.official_url
    ) {
      throw new Error(`Invalid official card output record at line ${nonEmptyIndex}.`);
    }
    if (!records.has(record.official_url)) {
      records.set(record.official_url, record);
    }
  }
  const compacted = [...records.values()]
    .map((record) => JSON.stringify(record))
    .join("\n");
  const output = compacted ? `${compacted}\n` : "";
  return {
    content: output,
    knownUrls: new Set(records.keys()),
    removedRecords: nonEmptyLines.length - records.size,
    repaired: malformedTrailingRecord || output !== content,
  };
}

async function loadKnownUrls() {
  try {
    const content = await readFile(OUTPUT_PATH, "utf8");
    const compacted = deduplicateCardOutput(content);
    if (compacted.repaired) {
      await writeFile(OUTPUT_PATH, compacted.content, "utf8");
      console.log(
        `Repaired local output: removed ${compacted.removedRecords} duplicate or incomplete record(s).`,
      );
    }
    return compacted.knownUrls;
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isOfficialUnavailablePlaceholder(detailHtml, detailUrl) {
  try {
    const url = new URL(detailUrl);
    if (
      url.protocol === "https:" &&
      url.hostname === "dm.takaratomy.co.jp" &&
      url.pathname === "/card/detail/"
    ) {
      const $ = load(detailHtml);
      const heading = $(".card-name").first().clone();
      if (heading.length === 0) {
        const title = $("title").text().replace(/\s+/g, " ").trim();
        return /^\(\s*DM[^)]*\)\s*\|\s*デュエル・マスターズ$/i.test(title);
      }
      if (heading.find(".packname").length === 0) {
        return false;
      }
      heading.find(".packname").remove();
      return heading.text().replace(/\s+/g, " ").trim().length === 0;
    }
    return false;
  } catch {
    return false;
  }
}

async function loadFailureRecords() {
  const source = await readJson(FAILURES_PATH, { failures: [] });
  const records = Array.isArray(source?.failures) ? source.failures : [];

  return new Map(
    records
      .filter(
        (record) =>
          record &&
          typeof record === "object" &&
          typeof record.official_url === "string" &&
          record.official_url.length > 0,
      )
      .map((record) => [record.official_url, record]),
  );
}

async function saveFailureRecords(failures) {
  const records = [...failures.values()].sort((left, right) =>
    left.official_url.localeCompare(right.official_url),
  );
  await writeFile(
    FAILURES_PATH,
    `${JSON.stringify(
      {
        failures: records,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function loadUnavailableRecords() {
  const source = await readJson(UNAVAILABLE_PATH, { unavailable: [] });
  const records = Array.isArray(source?.unavailable) ? source.unavailable : [];
  return new Map(
    records
      .filter(
        (record) =>
          record &&
          typeof record === "object" &&
          typeof record.official_url === "string" &&
          record.official_url.length > 0,
      )
      .map((record) => [record.official_url, record]),
  );
}

async function saveUnavailableRecords(unavailable) {
  const records = [...unavailable.values()].sort((left, right) =>
    left.official_url.localeCompare(right.official_url),
  );
  await writeFile(
    UNAVAILABLE_PATH,
    `${JSON.stringify(
      {
        unavailable: records,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function processFetchedCard({
  detailHtml,
  detailUrl,
  page,
  knownUrls,
  failures,
  unavailable = new Map(),
  appendRecord,
  persistFailures,
  persistUnavailable = async () => {},
  parseDetail = parseCardDetail,
  buildMetadata = buildCardSearchMetadata,
  now = () => new Date(),
}) {
  if (knownUrls.has(detailUrl)) {
    if (failures.delete(detailUrl)) await persistFailures(failures);
    return { status: "known" };
  }

  let completeCard;
  try {
    const card = parseDetail(detailHtml, detailUrl);
    const searchMetadata = await buildMetadata(card.name);
    completeCard = { ...card, ...searchMetadata };
  } catch (error) {
    if (isOfficialUnavailablePlaceholder(detailHtml, detailUrl)) {
      unavailable.set(detailUrl, {
        official_url: detailUrl,
        page,
        reason: "official_page_has_no_published_card_name",
        observed_at: now().toISOString(),
      });
      failures.delete(detailUrl);
      knownUrls.add(detailUrl);
      await Promise.all([
        persistFailures(failures),
        persistUnavailable(unavailable),
      ]);
      return { status: "unavailable" };
    }
    const previous = failures.get(detailUrl);
    const failedAt = now().toISOString();
    failures.set(detailUrl, {
      official_url: detailUrl,
      page,
      attempts: (previous?.attempts ?? 0) + 1,
      first_failed_at: previous?.first_failed_at ?? failedAt,
      last_failed_at: failedAt,
      last_error: errorMessage(error),
    });
    await persistFailures(failures);
    return { status: "failed", error: errorMessage(error) };
  }

  // Output failures must still stop the importer. Swallowing an append error
  // could make the checkpoint advance past a card that was never persisted.
  await appendRecord(completeCard);
  knownUrls.add(detailUrl);
  if (failures.delete(detailUrl)) await persistFailures(failures);
  return { status: "saved", card: completeCard };
}

async function saveCheckpoint(checkpoint) {
  await writeFile(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseFullImportArguments(process.argv.slice(2));
  await mkdir(".local", { recursive: true });

  const fetchText = createRateLimitedFetcher(options.delayMs);
  const robotsText = await fetchText(ROBOTS_URL, {
    headers: { accept: "text/plain,*/*;q=0.8" },
  });
  for (const pathname of ["/card/", "/card/detail/"]) {
    if (!isAllowedByRobots(robotsText, pathname)) {
      throw new Error(`robots.txt does not allow card-index access to ${pathname}`);
    }
  }

  const knownUrls = await loadKnownUrls();
  const failures = await loadFailureRecords();
  const unavailable = await loadUnavailableRecords();
  for (const detailUrl of unavailable.keys()) knownUrls.add(detailUrl);
  const previous = await readJson(CHECKPOINT_PATH, {});
  let page = options.startPage ?? previous.page ?? 1;
  let pagesProcessed = 0;
  let totalAvailable = previous.total_available ?? null;
  let reachedEnd = Boolean(previous.crawl_complete ?? previous.complete);
  let stopping = false;
  const attemptedUrls = new Set();
  process.once("SIGINT", () => {
    stopping = true;
    console.log("\nStopping after the current card. Progress will be preserved.");
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });

  const persistFailures = () => saveFailureRecords(failures);
  const persistUnavailable = () => saveUnavailableRecords(unavailable);
  const appendRecord = (card) =>
    appendFile(OUTPUT_PATH, `${JSON.stringify(card)}\n`, "utf8");

  async function importDetailUrl(detailUrl, sourcePage) {
    if (knownUrls.has(detailUrl)) {
      if (failures.delete(detailUrl)) await persistFailures();
      return { status: "known" };
    }

    attemptedUrls.add(detailUrl);
    // Network or filesystem failures still stop the importer. Only a failure
    // to parse/enrich one card is isolated so that the crawl remains polite
    // and does not skip a wider outage.
    const detailHtml = await fetchText(detailUrl);
    const result = await processFetchedCard({
      appendRecord,
      detailHtml,
      detailUrl,
      failures,
      unavailable,
      knownUrls,
      page: sourcePage,
      persistFailures,
      persistUnavailable,
    });
    if (result.status === "failed") {
      console.warn(`\nSkipped ${detailUrl}: ${result.error}`);
    }
    return result;
  }

  if (failures.size > 0) {
    console.log(`Retrying ${failures.size} previously failed card(s) before page ${page}.`);
    for (const failure of [...failures.values()]) {
      if (stopping) break;
      await importDetailUrl(failure.official_url, failure.page ?? page);
    }
  }

  while (!stopping && (!options.maxPages || pagesProcessed < options.maxPages)) {
    const searchHtml = await fetchText(CARD_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        pagenum: String(page),
        samename: "show",
        sort: "release_new",
      }),
    });
    const list = parseCardList(searchHtml);
    totalAvailable = resolveTotalAvailable(totalAvailable, list.totalAvailable);
    if (list.detailUrls.length === 0) {
      reachedEnd = true;
      break;
    }
    reachedEnd = false;

    for (const detailUrl of list.detailUrls) {
      if (stopping) break;
      if (knownUrls.has(detailUrl) || attemptedUrls.has(detailUrl)) continue;

      await importDetailUrl(detailUrl, page);
      await saveCheckpoint({
        cards_checked: knownUrls.size,
        complete: false,
        crawl_complete: false,
        failures_pending: failures.size,
        page,
        total_available: totalAvailable,
        updated_at: new Date().toISOString(),
      });
      process.stdout.write(
        `Page ${page}: ${knownUrls.size}/${totalAvailable ?? "?"} cards checked\r`,
      );
    }

    if (stopping) break;
    page += 1;
    pagesProcessed += 1;
    await saveCheckpoint({
      cards_checked: knownUrls.size,
      complete: false,
      crawl_complete: false,
      failures_pending: failures.size,
      page,
      total_available: totalAvailable,
      updated_at: new Date().toISOString(),
    });
  }

  const complete = !stopping && reachedEnd && failures.size === 0;
  await saveCheckpoint({
    cards_checked: knownUrls.size,
    complete,
    crawl_complete: reachedEnd,
    failures_pending: failures.size,
    page,
    total_available: totalAvailable,
    updated_at: new Date().toISOString(),
  });
  console.log(
    `\nSaved ${knownUrls.size} verified card records. ${
      complete ? "Catalog crawl is complete." : "Run the same command to resume."
    }`,
  );
  if (failures.size > 0) {
    console.log(
      `${failures.size} card(s) remain in ${FAILURES_PATH}; they will be retried first on the next run.`,
    );
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
