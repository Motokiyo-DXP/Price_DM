import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parseCardDetail, parseCardList } from "./import-dm-cards-sample.mjs";

const SOURCE_PATH = ".local/dm-cards-full.jsonl";
const OUTPUT_PATH = ".local/dm-card-types.jsonl";
const PRINT_OUTPUT_PATH = ".local/dm-card-type-prints.jsonl";
const SEARCH_URL = "https://dm.takaratomy.co.jp/card/";
const DELAY_MS = 750;
const CARD_TYPES = [
  "クリーチャー",
  "呪文",
  "進化クリーチャー",
  "サイキック",
  "ドラグハート",
  "フィールド",
  "城",
  "クロスギア",
  "エグザイル・クリーチャー",
  "GR",
  "オーラ",
  "タマシード",
  "デュエリスト",
  "デュエルメイト",
  "その他",
];

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function recordsFromJsonl(content) {
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function officialId(url) {
  try {
    return new URL(url).searchParams.get("id");
  } catch {
    return null;
  }
}

async function fetchSearchPage(cardType, page) {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "TCG-Souba-Checker/0.1 (personal noncommercial card type index)",
    },
    body: new URLSearchParams({
      cardtype: cardType,
      pagenum: String(page),
      samename: "show",
      sort: "release_new",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Official site returned HTTP ${response.status}.`);
  return parseCardList(await response.text());
}

export function aggregateCardTypes(cards, typesByOfficialId) {
  const typesByName = new Map();
  for (const card of cards) {
    const id = officialId(card.official_url);
    const types = id ? typesByOfficialId.get(id) : null;
    if (!types?.size || typeof card.name !== "string") continue;
    const nameTypes = typesByName.get(card.name) ?? new Set();
    for (const cardType of types) nameTypes.add(cardType);
    typesByName.set(card.name, nameTypes);
  }
  return [...typesByName]
    .sort(([left], [right]) => left.localeCompare(right, "ja"))
    .map(([name, cardTypes]) => ({ name, card_types: [...cardTypes] }));
}

async function main() {
  const cards = recordsFromJsonl(await readFile(SOURCE_PATH, "utf8"));
  const typesByOfficialId = new Map();
  let requestCount = 0;

  if (process.argv.includes("--complete-missing")) {
    for (const record of recordsFromJsonl(await readFile(PRINT_OUTPUT_PATH, "utf8"))) {
      typesByOfficialId.set(record.official_card_id, new Set(record.card_types));
    }
  } else for (const cardType of CARD_TYPES) {
    const seenUrls = new Set();
    let page = 1;
    let totalAvailable = null;
    while (true) {
      if (requestCount > 0) await sleep(DELAY_MS);
      const result = await fetchSearchPage(cardType, page);
      requestCount += 1;
      totalAvailable ??= result.totalAvailable;
      const freshUrls = result.detailUrls.filter((url) => !seenUrls.has(url));
      if (freshUrls.length === 0) break;
      for (const url of freshUrls) {
        seenUrls.add(url);
        const id = officialId(url);
        if (!id) continue;
        const types = typesByOfficialId.get(id) ?? new Set();
        types.add(cardType);
        typesByOfficialId.set(id, types);
      }
      console.log(JSON.stringify({ card_type: cardType, collected: seenUrls.size, page, total: totalAvailable }));
      if (totalAvailable !== null && seenUrls.size >= totalAvailable) break;
      page += 1;
    }
  }

  const missingPrints = cards.filter((card) => {
    const id = officialId(card.official_url);
    return id && !typesByOfficialId.has(id);
  });
  for (const card of missingPrints) {
    if (requestCount > 0) await sleep(DELAY_MS);
    const response = await fetch(card.official_url, {
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "user-agent": "TCG-Souba-Checker/0.1 (personal noncommercial card type index)",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Official site returned HTTP ${response.status}.`);
    const parsed = parseCardDetail(await response.text(), card.official_url);
    if (parsed.card_types.length === 0) {
      throw new Error(`Official card type is missing for ${card.official_url}.`);
    }
    typesByOfficialId.set(officialId(card.official_url), new Set(parsed.card_types));
    requestCount += 1;
  }

  const records = aggregateCardTypes(cards, typesByOfficialId);
  const sourceIds = new Set(cards.map((card) => officialId(card.official_url)).filter(Boolean));
  const printRecords = [...typesByOfficialId]
    .filter(([id]) => sourceIds.has(id))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([official_card_id, cardTypes]) => ({
      official_card_id,
      card_types: [...cardTypes],
    }));
  await mkdir(".local", { recursive: true });
  await writeFile(OUTPUT_PATH, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  await writeFile(PRINT_OUTPUT_PATH, printRecords.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  console.log(JSON.stringify({
    canonical_cards: records.length,
    matched_prints: printRecords.length,
    fallback_prints: missingPrints.length,
    requests: requestCount,
    source_prints: cards.length,
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
