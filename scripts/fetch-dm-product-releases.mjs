import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";

const BASE_URL = "https://dm.takaratomy.co.jp";
const OUTPUT_PATH = ".local/dm-product-releases.jsonl";
const DELAY_MS = 1_000;

function normalizeText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeProductCode(value) {
  const token = value?.trim().match(/^(DM\S+)/iu)?.[1];
  return token?.replaceAll("-", "").toUpperCase() ?? null;
}

export function parseJapaneseReleaseDate(value) {
  const match = value.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/u);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

export function parseProductArchive(html, pageUrl) {
  const $ = cheerio.load(html);
  const products = [];
  $(".itemList01_item").each((_index, element) => {
    const item = $(element);
    const name = normalizeText(item.find("h2.title").first().text());
    const releaseLabel = item.find("dl").filter((_i, dl) => normalizeText($(dl).find("dt").text()) === "発売日").first();
    const releaseDate = parseJapaneseReleaseDate(normalizeText(releaseLabel.find("dd").text()));
    const href = item.find('a[href*="/product/"]').filter((_i, anchor) => !$(anchor).attr("href")?.includes("#cardlist")).first().attr("href");
    const officialUrl = href ? new URL(href, pageUrl).href : null;
    const productSlug = officialUrl?.split("/product/")[1]?.split("/")[0] ?? "";
    const productCode = normalizeProductCode(productSlug) ?? normalizeProductCode(name);
    if (name && releaseDate && productCode) products.push({ product_code: productCode, product_name: name, release_date: releaseDate, official_url: officialUrl });
  });
  return { products, nextUrl: $("link[rel=next]").attr("href") ?? null };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: "text/html,*/*;q=0.8", "user-agent": "dm-price-tracker/1.0 official-product-release-import" } });
  if (!response.ok) throw new Error(`Official product page returned HTTP ${response.status}: ${url}`);
  return response.text();
}

async function main() {
  const robots = await fetchText(`${BASE_URL}/robots.txt`);
  if (/Disallow:\s*\/product\//iu.test(robots)) throw new Error("robots.txt does not allow /product/ access.");
  const byCode = new Map();
  let requests = 0;
  for (const archive of ["expansion", "deck", "others"]) {
    let pageUrl = `${BASE_URL}/product/${archive}/`;
    let page = 0;
    while (pageUrl) {
      if (requests > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      const parsed = parseProductArchive(await fetchText(pageUrl), pageUrl);
      for (const product of parsed.products) {
        const previous = byCode.get(product.product_code);
        if (previous && (previous.release_date !== product.release_date || previous.product_name !== product.product_name)) throw new Error(`Conflicting official product data for ${product.product_code}: ${JSON.stringify(previous)} / ${JSON.stringify(product)}`);
        byCode.set(product.product_code, product);
      }
      page += 1;
      requests += 1;
      console.log(`Checked ${archive} archive page ${page}: ${byCode.size} releases`);
      pageUrl = parsed.nextUrl ? new URL(parsed.nextUrl, pageUrl).href : null;
      if (page > 100) throw new Error(`Product archive pagination did not terminate: ${archive}.`);
    }
  }
  await mkdir(".local", { recursive: true });
  const records = [...byCode.values()].sort((a, b) => a.release_date.localeCompare(b.release_date) || a.product_code.localeCompare(b.product_code));
  await writeFile(OUTPUT_PATH, `${records.map(JSON.stringify).join("\n")}\n`, "utf8");
  console.log(`Saved ${records.length} official product releases to ${OUTPUT_PATH}.`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) main().catch((error) => { console.error(error); process.exitCode = 1; });
