import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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

async function loadKnownUrls() {
  try {
    const content = await readFile(OUTPUT_PATH, "utf8");
    return new Set(
      content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line).official_url)
        .filter(Boolean),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }
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
  const previous = await readJson(CHECKPOINT_PATH, {});
  let page = options.startPage ?? previous.page ?? 1;
  let pagesProcessed = 0;
  let totalAvailable = previous.total_available ?? null;
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
    console.log("\nStopping after the current card. Progress will be preserved.");
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });

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
    totalAvailable ??= list.totalAvailable;
    if (list.detailUrls.length === 0) break;

    for (const detailUrl of list.detailUrls) {
      if (stopping) break;
      if (knownUrls.has(detailUrl)) continue;

      const detailHtml = await fetchText(detailUrl);
      const card = parseCardDetail(detailHtml, detailUrl);
      const searchMetadata = await buildCardSearchMetadata(card.name);
      const completeCard = { ...card, ...searchMetadata };
      await appendFile(OUTPUT_PATH, `${JSON.stringify(completeCard)}\n`, "utf8");
      knownUrls.add(detailUrl);
      await saveCheckpoint({
        cards_checked: knownUrls.size,
        complete: false,
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
      page,
      total_available: totalAvailable,
      updated_at: new Date().toISOString(),
    });
  }

  const complete = !stopping && !options.maxPages;
  await saveCheckpoint({
    cards_checked: knownUrls.size,
    complete,
    page,
    total_available: totalAvailable,
    updated_at: new Date().toISOString(),
  });
  console.log(
    `\nSaved ${knownUrls.size} verified card records. ${
      complete ? "Catalog crawl is complete." : "Run the same command to resume."
    }`,
  );
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
