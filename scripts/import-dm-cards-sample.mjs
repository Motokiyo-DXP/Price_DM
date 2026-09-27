import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";

const BASE_URL = "https://dm.takaratomy.co.jp";
const CARD_SEARCH_URL = `${BASE_URL}/card/`;
const ROBOTS_URL = `${BASE_URL}/robots.txt`;
const USER_AGENT =
  "TCG-Souba-Checker/0.1 (personal noncommercial card-index sample; rules text, no images)";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_DELAY_MS = 1_000;
const MIN_DELAY_MS = 750;

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRuleText(value) {
  return value
    .replace(/\u00a0/gu, " ")
    .split(/\r?\n/u)
    .map((line) => line.replace(/[\t\f\v ]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function nodeText($, node) {
  if (node.type === "text") return node.data ?? "";
  if (node.type !== "tag") return "";
  if (node.name === "br") return "\n";
  if (node.name === "img") {
    const alt = $(node).attr("alt");
    return typeof alt === "string" ? alt : "";
  }
  return (node.children ?? []).map((child) => nodeText($, child)).join("");
}

function cardFaceRules($, face, officialUrl) {
  const raceCells = $(face).find("td.race");
  if (raceCells.length !== 1) {
    throw new Error(`Could not find exactly one race field for a card face in ${officialUrl}`);
  }

  const abilityTables = $(face).find("table").filter((_, table) =>
    $(table).find("th").toArray().some((heading) =>
      normalizeText($(heading).text()) === "特殊能力",
    ),
  );
  if (abilityTables.length !== 1) {
    throw new Error(`Could not find exactly one special-ability section for a card face in ${officialUrl}`);
  }

  const abilityCells = abilityTables.first().find("td.skills");
  if (abilityCells.length !== 1) {
    throw new Error(`Could not find the special-ability text cell for a card face in ${officialUrl}`);
  }

  const abilities = abilityCells.first().children("li").toArray();
  const cardText = abilities.length > 0
    ? abilities.map((ability) => normalizeRuleText(nodeText($, ability)))
      .filter(Boolean)
      .join("\n")
    : normalizeRuleText(nodeText($, abilityCells.first().get(0)));

  const races = normalizeText(raceCells.first().text())
    .split(/[\/／]/u)
    .map((race) => race.trim())
    .filter(Boolean);

  return { cardText, races };
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseArguments(argv) {
  const values = new Map(
    argv.map((argument) => {
      const [key, value] = argument.split("=", 2);
      return [key, value];
    }),
  );

  const limit = parsePositiveInteger(
    values.get("--limit") ?? String(DEFAULT_LIMIT),
    "--limit",
  );
  const page = parsePositiveInteger(values.get("--page") ?? "1", "--page");
  const delayMs = parsePositiveInteger(
    values.get("--delay-ms") ?? String(DEFAULT_DELAY_MS),
    "--delay-ms",
  );

  if (limit > MAX_LIMIT) {
    throw new Error(`--limit cannot exceed ${MAX_LIMIT} in sample mode.`);
  }
  if (delayMs < MIN_DELAY_MS) {
    throw new Error(`--delay-ms cannot be lower than ${MIN_DELAY_MS}.`);
  }

  return { delayMs, limit, page };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(url, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "user-agent": USER_AGENT,
          ...options.headers,
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        throw new Error(
          `Official site returned HTTP ${response.status}; stopping without retrying.`,
        );
      }
      if (!response.ok) {
        throw new Error(`Official site returned HTTP ${response.status}.`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const mustStop = /HTTP (403|429|5\d\d)/.test(message);
      if (mustStop || attempt === 2) {
        throw error;
      }
      await sleep(1_000);
    }
  }

  throw lastError;
}

function readRobotsRules(robotsText) {
  const rules = [];
  let appliesToAll = false;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      appliesToAll = value === "*";
    } else if (appliesToAll && (field === "allow" || field === "disallow")) {
      if (value) rules.push({ field, value });
    }
  }

  return rules;
}

export function isAllowedByRobots(robotsText, pathname) {
  const matches = readRobotsRules(robotsText)
    .filter((rule) => pathname.startsWith(rule.value))
    .sort((left, right) => right.value.length - left.value.length);

  return matches.length === 0 || matches[0].field === "allow";
}

export function parseCardList(html) {
  const $ = load(html);
  const seen = new Set();
  const detailUrls = [];

  $('#cardlist a[href*="/card/detail/?id="]').each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const detailUrl = new URL(href, BASE_URL).toString();
    if (seen.has(detailUrl)) return;

    seen.add(detailUrl);
    detailUrls.push(detailUrl);
  });

  const totalText = normalizeText($("#total_count").first().text());
  const totalAvailable = Number.parseInt(totalText.replace(/[^0-9]/g, ""), 10);

  return {
    detailUrls,
    totalAvailable: Number.isFinite(totalAvailable) ? totalAvailable : null,
  };
}

function findProductName($, officialId) {
  const productSlug = officialId.split("-", 1)[0].toLowerCase();
  const products = $(".productCardList li")
    .map((_, element) => {
      const link = $(element).find("a").first();
      return {
        href: link.attr("href") ?? "",
        name: normalizeText($(element).text()),
      };
    })
    .get()
    .filter((product) => product.name);

  const exactProduct = products.find((product) => {
    try {
      return new URL(product.href, BASE_URL).pathname
        .toLowerCase()
        .includes(`/product/${productSlug}/`);
    } catch {
      return false;
    }
  });

  // Do not silently associate an unrelated product when the official id
  // cannot be matched to a product slug on the detail page.
  return exactProduct?.name ?? null;
}

export function parseCardDetail(html, officialUrl) {
  const $ = load(html);
  const officialId = new URL(officialUrl).searchParams.get("id");
  if (!officialId) throw new Error(`Missing official card id in ${officialUrl}`);

  const heading = $(".card-name").first().clone();
  const cardNumber = normalizeText(heading.find(".packname").first().text())
    .replace(/^\(/, "")
    .replace(/\)$/, "");
  heading.find(".packname").remove();
  const name = normalizeText(heading.text());

  if (!name) throw new Error(`Could not find the card name for ${officialUrl}`);

  const costText = normalizeText($(".cardDetail td.cost").first().text());
  const normalizedCost = costText.replace(/[０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0),
  );
  const costMatch = normalizedCost.match(/\d+/);
  const cost = costMatch ? Number.parseInt(costMatch[0], 10) : null;
  const civilizationMap = new Map([
    ["光", "light"],
    ["水", "water"],
    ["闇", "darkness"],
    ["火", "fire"],
    ["自然", "nature"],
    ["ゼロ", "zero"],
    ["無色", "zero"],
  ]);
  const civilizations = [...new Set(
    $(".cardDetail td.civil").toArray()
      .flatMap((element) => normalizeText($(element).text())
      .split(/[\/／・]/u)
      .map((value) => civilizationMap.get(value.trim())))
      .filter(Boolean),
  )];

  const cardTypes = [...new Set(
    $(".cardDetail").toArray()
      .flatMap((detail) => $(detail).find("th").toArray())
      .filter((heading) => normalizeText($(heading).text()) === "カードの種類")
      .map((heading) => normalizeText($(heading).next("td").text()))
      .filter(Boolean),
  )];

  const cardFaces = $(".cardDetail").toArray();
  if (cardFaces.length === 0) {
    throw new Error(`Could not find card faces for ${officialUrl}`);
  }
  const faceRules = cardFaces.map((face) => cardFaceRules($, face, officialUrl));
  const races = [...new Set(faceRules.flatMap((face) => face.races))];
  const cardTexts = faceRules.map((face) => face.cardText);

  return {
    card_number: cardNumber || null,
    card_texts: cardTexts,
    card_types: cardTypes,
    civilizations,
    cost: Number.isSafeInteger(cost) && cost >= 0 && cost <= 99 ? cost : null,
    name,
    name_kana: null,
    official_url: officialUrl,
    product_name: findProductName($, officialId),
    races,
  };
}

async function main() {
  const { delayMs, limit, page } = parseArguments(process.argv.slice(2));
  const robotsText = await fetchText(ROBOTS_URL, {
    headers: { accept: "text/plain,*/*;q=0.8" },
  });

  for (const pathname of ["/card/", "/card/detail/"]) {
    if (!isAllowedByRobots(robotsText, pathname)) {
      throw new Error(`robots.txt does not allow sample access to ${pathname}`);
    }
  }

  const searchHtml = await fetchText(CARD_SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      pagenum: String(page),
      samename: "show",
      sort: "release_new",
    }),
  });
  const { detailUrls, totalAvailable } = parseCardList(searchHtml);
  const selectedUrls = detailUrls.slice(0, limit);

  if (selectedUrls.length < limit) {
    throw new Error(`Expected ${limit} cards, but the page contained ${selectedUrls.length}.`);
  }

  const cards = [];
  for (const [index, detailUrl] of selectedUrls.entries()) {
    if (index > 0) await sleep(delayMs);
    const detailHtml = await fetchText(detailUrl);
    cards.push(parseCardDetail(detailHtml, detailUrl));
    process.stdout.write(`Checked ${index + 1}/${selectedUrls.length}\r`);
  }
  process.stdout.write("\n");

  const output = {
    cards,
    checked_at: new Date().toISOString(),
    dry_run: true,
    page,
    source: CARD_SEARCH_URL,
    total_available: totalAvailable,
  };

  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/dm-cards-sample.json",
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  console.table(
    cards.map((card) => ({
      card_number: card.card_number,
      name: card.name,
      product_name: card.product_name,
    })),
  );
  console.log(
    `Dry run only: ${cards.length} cards were saved to .local/dm-cards-sample.json. Supabase was not changed.`,
  );
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
