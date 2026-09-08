import { appendFile, mkdir, readFile } from "node:fs/promises";
import { isAllowedByRobots } from "./import-dm-cards-sample.mjs";
import { extractReadings, isSkippableCardPageStatus, pageUrlFor, SOURCE_NAME } from "./dmwiki-original01.mjs";

const output = `.local/dmwiki-readings-${SOURCE_NAME}.jsonl`;
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const delay = Number.parseInt(arg("--delay-ms") ?? "1000", 10);
if (!Number.isSafeInteger(delay) || delay < 750) throw new Error("--delay-ms must be at least 750.");

async function fetchText(url, { allowCardPageSkip = false } = {}) {
  const response = await fetch(url, { headers: { "user-agent": "TCG-Souba-Checker/0.1 (authorized reading-index import)" }, signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return { text: null, skipped_reason: "http_404" };
  if (allowCardPageSkip && isSkippableCardPageStatus(response.status)) {
    return { text: null, skipped_reason: `http_${response.status}` };
  }
  if (response.status === 403 || response.status === 429 || response.status >= 500) throw new Error(`original01 returned HTTP ${response.status}; stopped safely.`);
  if (!response.ok) throw new Error(`original01 returned HTTP ${response.status}.`);
  return { text: await response.text(), skipped_reason: null };
}

const { text: robots } = await fetchText("https://dmwiki.net/robots.txt");
if (!robots || !isAllowedByRobots(robots, "/")) throw new Error("original01 robots.txt does not allow card-page access.");
const input = (await readFile(".local/dm-cards-full.jsonl", "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const onlyName = arg("--name");
const limit = Number.parseInt(arg("--limit") ?? String(Number.MAX_SAFE_INTEGER), 10);
const names = [...new Set(input.map((row) => row.name).filter(Boolean))].filter((name) => !onlyName || name === onlyName).slice(0, limit);
let completed = new Set();
try { completed = new Set((await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse).map((row) => row.name)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
await mkdir(".local", { recursive: true });
let checked = 0;
for (const name of names) {
  if (completed.has(name)) continue;
  if (checked) await new Promise((resolve) => setTimeout(resolve, delay));
  const source_url = pageUrlFor(name);
  const { text: html, skipped_reason } = await fetchText(source_url, { allowCardPageSkip: true });
  const parsed = html ? extractReadings(html, name) : { matched: false, readings: [] };
  await appendFile(output, `${JSON.stringify({ name, readings: parsed.readings, matched: parsed.matched, source: SOURCE_NAME, source_url, checked_at: new Date().toISOString(), ...(skipped_reason ? { skipped_reason } : {}) })}\n`);
  checked += 1;
  process.stdout.write(`${skipped_reason ? "Skipped" : "Checked"} ${checked}/${names.length}\r`);
}
process.stdout.write(`\nCompleted ${checked} new card page(s).\n`);
