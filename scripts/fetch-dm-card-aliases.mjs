import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DECK_MAKER_URL = "https://deck-maker.com/dm/decks/new/";
const USER_AGENT =
  "TCG-Souba-Checker/0.1 (personal noncommercial name-alias index; no images or card text)";
const OUTPUT_PATH = ".local/dm-card-aliases.json";

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "text/html,application/javascript,application/json;q=0.9,*/*;q=0.8",
      "user-agent": USER_AGENT,
      ...options.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    throw new Error(`Alias source returned HTTP ${response.status}; stopped safely.`);
  }
  if (!response.ok) throw new Error(`Alias source returned HTTP ${response.status}.`);
  return response.text();
}

export function parseSearchConfig(scriptText) {
  const match = scriptText.match(
    /ELASTIC_SEARCH_ENDPOINT:"([^"]+)",ELASTIC_SEARCH_CREDENTIAL:"([^"]+)"/,
  );
  return match ? { endpoint: match[1], credential: match[2] } : null;
}

async function discoverSearchConfig() {
  const html = await fetchText(DECK_MAKER_URL);
  const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(
    (match) => new URL(match[1], DECK_MAKER_URL).toString(),
  );

  for (const scriptUrl of scriptUrls) {
    const config = parseSearchConfig(await fetchText(scriptUrl));
    if (config) return config;
  }
  throw new Error("Could not discover the public card-search configuration.");
}

export function mergeAliasRecord(aliasMap, source) {
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const ruby =
    typeof source.name_ruby === "string" ? source.name_ruby.trim() : "";
  if (!name || !ruby || name === ruby) return;

  const aliases = aliasMap.get(name) ?? new Set();
  aliases.add(ruby);
  aliasMap.set(name, aliases);
}

async function main() {
  const { endpoint, credential } = await discoverSearchConfig();
  const aliasMap = new Map();
  let searchAfter = null;
  let checked = 0;
  let expected = null;

  while (true) {
    const requestBody = {
      _source: ["main_card_id", "name", "name_ruby"],
      query: { match_all: {} },
      size: 500,
      sort: [{ main_card_id: "asc" }],
      track_total_hits: true,
    };
    if (searchAfter) requestBody.search_after = searchAfter;

    const response = await fetch(`${endpoint}/dm-cards/_search`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `ApiKey ${credential}`,
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      throw new Error(`Alias search returned HTTP ${response.status}; stopped safely.`);
    }
    if (!response.ok) throw new Error(`Alias search returned HTTP ${response.status}.`);

    const result = await response.json();
    const hits = result.hits?.hits ?? [];
    expected ??= result.hits?.total?.value ?? null;
    if (hits.length === 0) break;

    for (const hit of hits) mergeAliasRecord(aliasMap, hit._source ?? {});
    checked += hits.length;
    searchAfter = hits.at(-1)?.sort ?? null;
    process.stdout.write(`Checked ${checked}/${expected ?? "?"} alias records\r`);
    if (!searchAfter || hits.length < 500) break;
  }

  const aliases = [...aliasMap.entries()]
    .map(([name, values]) => ({ name, aliases: [...values].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name, "ja"));
  await mkdir(".local", { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        aliases,
        cards_checked: checked,
        checked_at: new Date().toISOString(),
        source: DECK_MAKER_URL,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`\nSaved ${aliases.length} verified alternate-reading entries.`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
