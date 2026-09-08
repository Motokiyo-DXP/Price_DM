import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { normalizeProductCode } from "./fetch-dm-product-releases.mjs";

const CARD_PATH = ".local/dm-cards-full.jsonl";
const RELEASE_PATH = ".local/dm-product-releases.jsonl";
const DIRECTORY = ".local/dm-product-release-sql";

function sql(value) { return value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`; }
function readJsonl(value) { return value.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }
function officialCardId(card) {
  try {
    const match = new URL(card.official_url).search.match(/[?&]id=([^&]+)/u);
    return match ? decodeURIComponent(match[1]).trim() || null : null;
  } catch { return null; }
}
function officialProductPrefix(card) { return officialCardId(card)?.split("-")[0]?.toUpperCase() ?? null; }

export function matchCardsToReleases(cards, releases) {
  const aliases = new Map();
  for (const release of releases) {
    aliases.set(release.product_code, release);
    aliases.set(normalizeProductCode(release.product_name), release);
  }
  return cards.flatMap((card) => {
    const release = aliases.get(officialProductPrefix(card)) ?? aliases.get(normalizeProductCode(card.product_name));
    const id = officialCardId(card);
    return release && id ? [{ official_card_id: id, product_code: release.product_code }] : [];
  });
}

export function buildProductSql(releases) {
  const values = releases.map((r) => `(${sql(r.product_code)}, ${sql(r.product_name)}, ${sql(r.release_date)}::date, ${sql(r.official_url)})`).join(",\n");
  return `begin;\nwith game as (select id from public.tcg_games where slug='duel-masters'), source(product_code,product_name,release_date,official_url) as (values\n${values}\n) insert into public.card_products(game_id,product_code,product_name,release_date,release_date_precision,official_url,source_checked_at) select game.id,source.product_code,source.product_name,source.release_date,'day',source.official_url,pg_catalog.now() from source cross join game on conflict(game_id,product_code) do update set product_name=excluded.product_name,release_date=excluded.release_date,release_date_precision=excluded.release_date_precision,official_url=excluded.official_url,source_checked_at=excluded.source_checked_at,updated_at=pg_catalog.now();\ncommit;\n`;
}

export function buildLinkSql(links) {
  const values = links.map((r) => `(${sql(r.official_card_id)}, ${sql(r.product_code)})`).join(",\n");
  return `begin;\nwith game as (select id from public.tcg_games where slug='duel-masters'), source(official_card_id,product_code) as (values\n${values}\n) update public.card_prints prints set product_id=products.id,updated_at=pg_catalog.now() from source join game on true join public.card_products products on products.game_id=game.id and products.product_code=source.product_code where lower(prints.official_card_id)=lower(source.official_card_id) and prints.product_id is distinct from products.id;\ncommit;\n`;
}

export function buildLinkAuditSql(links) {
  const values = links.map((r) => `(${sql(r.official_card_id)}, ${sql(r.product_code)})`).join(",\n");
  return `with source(official_card_id,product_code) as (values\n${values}\n) select source.official_card_id,source.product_code,prints.id as card_print_id,products.id as product_id,prints.product_id as linked_product_id from source left join public.card_prints prints on lower(prints.official_card_id)=lower(source.official_card_id) left join public.tcg_games game on game.slug='duel-masters' left join public.card_products products on products.game_id=game.id and products.product_code=source.product_code where prints.id is null or products.id is null or prints.product_id is distinct from products.id order by source.official_card_id;\n`;
}

async function main() {
  const [cardsText, releasesText] = await Promise.all([readFile(CARD_PATH, "utf8"), readFile(RELEASE_PATH, "utf8")]);
  const cards = readJsonl(cardsText);
  const releases = readJsonl(releasesText);
  const links = matchCardsToReleases(cards, releases);
  await mkdir(DIRECTORY, { recursive: true });
  const files = ["products.sql"];
  await writeFile(`${DIRECTORY}/products.sql`, buildProductSql(releases), "utf8");
  await writeFile(`${DIRECTORY}/audit-links.sql`, buildLinkAuditSql(links), "utf8");
  for (let offset = 0, index = 1; offset < links.length; offset += 1_000, index += 1) {
    const file = `links-${String(index).padStart(3, "0")}.sql`;
    files.push(file);
    await writeFile(`${DIRECTORY}/${file}`, buildLinkSql(links.slice(offset, offset + 1_000)), "utf8");
  }
  const unmatched = cards.length - links.length;
  await writeFile(`${DIRECTORY}/manifest.json`, `${JSON.stringify({ complete: true, official_products: releases.length, card_prints_linked: links.length, card_prints_unmatched: unmatched, files }, null, 2)}\n`, "utf8");
  console.log(`Built ${releases.length} products and ${links.length}/${cards.length} card-print links (${unmatched} remain without an exact official product date).`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) main().catch((error) => { console.error(error); process.exitCode = 1; });
