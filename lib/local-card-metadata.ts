import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

export type LocalCardMetadata = { cost: number | null; civilizations: string[] };
type OfficialCardSource = { name?: unknown; official_url?: unknown };

let metadataPromise: Promise<Map<string, LocalCardMetadata>> | null = null;
let officialSourcesPromise: Promise<Map<string, string[]>> | null = null;
const resolvedOfficialMetadata = new Map<string, Promise<LocalCardMetadata | null>>();

export function loadLocalCardMetadata() {
  metadataPromise ??= readFile(path.join(process.cwd(), ".local", "dm-card-metadata.jsonl"), "utf8")
    .then((content) => new Map(content.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
      try {
        const value = JSON.parse(line) as { name?: unknown; cost?: unknown; civilizations?: unknown };
        if (typeof value.name !== "string") return [];
        return [[value.name, {
          cost: typeof value.cost === "number" ? value.cost : null,
          civilizations: Array.isArray(value.civilizations) ? value.civilizations.filter((item): item is string => typeof item === "string") : [],
        }] as const];
      } catch {
        return [];
      }
    })))
    .catch(() => new Map<string, LocalCardMetadata>());
  return metadataPromise;
}

function loadOfficialCardSources() {
  officialSourcesPromise ??= readFile(path.join(process.cwd(), ".local", "dm-cards-full.jsonl"), "utf8")
    .then((content) => {
      const sources = new Map<string, string[]>();
      for (const line of content.split(/\r?\n/u).filter(Boolean)) {
        try {
          const value = JSON.parse(line) as OfficialCardSource;
          if (typeof value.name !== "string" || typeof value.official_url !== "string") continue;
          const urls = sources.get(value.name) ?? [];
          if (!urls.includes(value.official_url)) sources.set(value.name, [...urls, value.official_url]);
        } catch {
          // Ignore a malformed source row without disabling all metadata fallbacks.
        }
      }
      return sources;
    })
    .catch(() => new Map<string, string[]>());
  return officialSourcesPromise;
}

export function parseOfficialCardCost(html: string) {
  const $ = load(html);
  const costText = $(".cardDetail td.cost").first().text().replace(/\s+/g, " ").trim()
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0));
  const match = costText.match(/\d+/u);
  if (!match) return null;
  const cost = Number.parseInt(match[0], 10);
  return Number.isSafeInteger(cost) && cost >= 0 && cost <= 99 ? cost : null;
}

async function fetchOfficialMetadata(name: string, urls: string[]) {
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8", "user-agent": "TCG-Souba-Checker/0.1 (personal noncommercial card metadata lookup)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      return { cost: parseOfficialCardCost(await response.text()), civilizations: [] } satisfies LocalCardMetadata;
    } catch {
      // A different print URL for the same canonical card may still be available.
    }
  }
  void name;
  return null;
}

export async function resolveLocalCardMetadata(names: readonly string[]) {
  const [localMetadata, sources] = await Promise.all([loadLocalCardMetadata(), loadOfficialCardSources()]);
  const resolved = new Map(localMetadata);
  for (const name of new Set(names)) {
    if (resolved.has(name)) continue;
    const urls = sources.get(name) ?? [];
    if (urls.length === 0) continue;
    let pending = resolvedOfficialMetadata.get(name);
    if (!pending) {
      pending = fetchOfficialMetadata(name, urls);
      resolvedOfficialMetadata.set(name, pending);
    }
    const metadata = await pending;
    if (metadata) resolved.set(name, metadata);
  }
  return resolved;
}
