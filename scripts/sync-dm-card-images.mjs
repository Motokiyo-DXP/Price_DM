import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
import sharp from "sharp";

const USER_AGENT = "DM-Souba/0.2 (noncommercial licensed card-image archive; contact site operator)";

export function officialCardId(officialUrl) {
  try {
    const url = new URL(officialUrl);
    const id = url.hostname === "dm.takaratomy.co.jp" ? url.searchParams.get("id") : null;
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch { return null; }
}

export function officialImageUrl(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid official card ID.");
  return `https://dm.takaratomy.co.jp/wp-content/card/cardimage/${id}.jpg`;
}

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

export function parseArguments(argv) {
  const values = new Map(argv.map((argument) => argument.split("=", 2)));
  const concurrency = positiveInteger(values.get("--concurrency") ?? "2", "--concurrency");
  const delayMs = positiveInteger(values.get("--delay-ms") ?? "250", "--delay-ms");
  if (concurrency > 4) throw new Error("--concurrency cannot exceed 4.");
  if (delayMs < 100) throw new Error("--delay-ms cannot be lower than 100.");
  return { input: values.get("--input") ?? ".local/dm-cards-full.jsonl", output: values.get("--output") ?? "public/cards/official", manifest: values.get("--manifest") ?? ".local/dm-card-images.jsonl", limit: values.has("--limit") ? positiveInteger(values.get("--limit"), "--limit") : null, concurrency, delayMs };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function loadRecords(filename) { return (await readFile(filename, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
async function loadManifest(filename) {
  try { return new Map((await loadRecords(filename)).map((row) => [row.official_card_id, row])); }
  catch (error) { if (error?.code === "ENOENT") return new Map(); throw error; }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const [cards, manifest] = await Promise.all([loadRecords(options.input), loadManifest(options.manifest)]);
  const candidates = cards.map((card) => ({ card, id: officialCardId(card.official_url) })).filter((item) => item.id);
  const pending = candidates.filter((item) => !manifest.has(item.id)).slice(0, options.limit ?? undefined);
  await Promise.all([mkdir(options.output, { recursive: true }), mkdir(path.dirname(options.manifest), { recursive: true })]);
  let downloaded = 0;
  let failed = 0;
  let nextRequestAt = 0;
  let sinceCheckpoint = 0;

  async function persistManifest() {
    await writeFile(options.manifest, `${[...manifest.values()].map((row) => JSON.stringify(row)).join("\n")}\n`);
    sinceCheckpoint = 0;
  }

  async function fetchWithRateLimit(url, accept) {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    nextRequestAt = Math.max(Date.now(), nextRequestAt) + options.delayMs;
    if (waitMs) await sleep(waitMs);
    return fetch(url, { headers: { accept, "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  }

  async function fetchImage(item) {
    const expectedUrl = officialImageUrl(item.id);
    let response = await fetchWithRateLimit(expectedUrl, "image/*");
    if (response.ok) return { response, imageUrl: expectedUrl };
    if (response.status !== 404) throw new Error(`HTTP ${response.status}`);
    const detailResponse = await fetchWithRateLimit(item.card.official_url, "text/html,application/xhtml+xml");
    if (!detailResponse.ok) throw new Error(`detail HTTP ${detailResponse.status}`);
    const $ = load(await detailResponse.text());
    const imageUrl = $('meta[property="og:image"]').attr("content");
    if (!imageUrl || !imageUrl.startsWith("https://dm.takaratomy.co.jp/wp-content/card/cardimage/")) throw new Error("official image URL not found");
    response = await fetchWithRateLimit(imageUrl, "image/*");
    if (!response.ok) throw new Error(`fallback HTTP ${response.status}`);
    return { response, imageUrl };
  }

  async function download(item) {
    try {
      const { response, imageUrl } = await fetchImage(item);
      const source = Buffer.from(await response.arrayBuffer());
      const outputPath = path.join(options.output, `${item.id}.webp`);
      const info = await sharp(source).rotate().resize({ width: 384, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(outputPath);
      const file = await stat(outputPath);
      manifest.set(item.id, { official_card_id: item.id, card_name: item.card.name, card_number: item.card.card_number, official_url: item.card.official_url, source_image_url: imageUrl, image_key: `official/${item.id}`, width: info.width, height: info.height, byte_size: file.size, downloaded_at: new Date().toISOString() });
      downloaded += 1;
      sinceCheckpoint += 1;
      process.stdout.write(`\rDownloaded ${downloaded}/${pending.length}; failed ${failed}`);
    } catch (error) {
      failed += 1;
      console.error(`\n${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (let index = 0; index < pending.length; index += options.concurrency) {
    await Promise.all(pending.slice(index, index + options.concurrency).map(download));
    if (sinceCheckpoint >= 50) await persistManifest();
  }
  if (sinceCheckpoint > 0) await persistManifest();
  console.log(`\n${JSON.stringify({ catalog: candidates.length, existing: manifest.size - downloaded, attempted: pending.length, downloaded, failed, remaining: candidates.length - manifest.size, manifest: options.manifest }, null, 2)}`);
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
