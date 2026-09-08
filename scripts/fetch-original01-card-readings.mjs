import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAllowedByRobots } from "./import-dm-cards-sample.mjs";
import {
  extractOriginal01Readings,
  ORIGINAL01_SOURCE,
  original01PageUrl,
} from "./original01-card-readings.mjs";

const INPUT_PATH = ".local/dm-cards-full.jsonl";
const OUTPUT_PATH = `.local/dm-card-readings-${ORIGINAL01_SOURCE}.jsonl`;
const USER_AGENT = "TCG-Souba-Checker/0.1 (authorized reading-index import)";
const MIN_DELAY_MS = 750;

const argumentValue = (argv, name) =>
  argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);

function positiveInteger(value, label) {
  const result = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return result;
}

export function parseOriginal01Arguments(argv) {
  const delayMs = positiveInteger(argumentValue(argv, "--delay-ms") ?? "1000", "--delay-ms");
  if (delayMs < MIN_DELAY_MS) throw new Error(`--delay-ms cannot be lower than ${MIN_DELAY_MS}.`);
  const limitValue = argumentValue(argv, "--limit");
  return {
    delayMs,
    limit: limitValue ? positiveInteger(limitValue, "--limit") : null,
    onlyName: argumentValue(argv, "--name") ?? null,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    throw new Error(`original01 returned HTTP ${response.status}; stopped safely.`);
  }
  if (!response.ok) throw new Error(`original01 returned HTTP ${response.status}.`);
  return response.text();
}

const readJsonLines = async (path) =>
  (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

async function completedNames() {
  try {
    return new Set((await readJsonLines(OUTPUT_PATH)).map((row) => row.name));
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }
}

async function main() {
  const options = parseOriginal01Arguments(process.argv.slice(2));
  const robots = await fetchText("https://dmwiki.net/robots.txt");
  if (robots === null || !isAllowedByRobots(robots, "/")) {
    throw new Error("original01 robots.txt does not allow card-page access.");
  }
  const rows = await readJsonLines(INPUT_PATH);
  const names = [...new Set(rows.map((row) => String(row.name ?? "").trim()).filter(Boolean))]
    .filter((name) => !options.onlyName || name === options.onlyName)
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  const completed = await completedNames();
  await mkdir(".local", { recursive: true });
  let checked = 0;
  let imported = 0;
  for (const name of names) {
    if (completed.has(name)) continue;
    if (checked > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const sourceUrl = original01PageUrl(name);
    const html = await fetchText(sourceUrl);
    const parsed = html ? extractOriginal01Readings(html, name) : { matched: false, readings: [] };
    await appendFile(OUTPUT_PATH, `${JSON.stringify({ name, readings: parsed.readings, matched: parsed.matched, source: ORIGINAL01_SOURCE, source_url: sourceUrl, checked_at: new Date().toISOString() })}\n`, "utf8");
    completed.add(name);
    checked += 1;
    if (parsed.readings.length > 0) imported += 1;
    process.stdout.write(`Checked ${checked}/${names.length}; readings ${imported}\r`);
  }
  await writeFile(`.local/dm-card-readings-${ORIGINAL01_SOURCE}-summary.json`, `${JSON.stringify({ source: ORIGINAL01_SOURCE, total_names: names.length, checked, imported, completed_at: new Date().toISOString() }, null, 2)}\n`, "utf8");
  process.stdout.write(`\nSaved ${imported} reading record(s) from ${checked} checked card(s).\n`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
