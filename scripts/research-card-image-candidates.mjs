import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
import sharp from "sharp";
import { describe, sha256 } from "./audit-card-image-resolution.mjs";

const normalize = (v) => v.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
export function matchesPrintingNumber(title, number) {
  if (!number) return false;
  const escaped = normalize(number).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${escaped}(?![A-Z0-9])`, "u").test(normalize(title));
}
export function extractCandidates(html, row, pageUrl) {
  const $ = load(html), products = new Map();
  $('a[href*="/view/item/"]').each((_, element) => {
    const a = $(element), url = new URL(a.attr("href"), pageUrl);
    if (url.origin !== "https://www.nemcard.com") return;
    const item = products.get(url.href) ?? { product_url: url.href };
    const name = a.text().trim().replace(/\s+/g, " ");
    if (name && name !== "SOLD OUT") item.product_title = name;
    const image = a.find("img").attr("src");
    if (image) {
      const imageUrl = new URL(image, pageUrl);
      if (imageUrl.hostname === "makeshop-multi-images.akamaized.net" && imageUrl.pathname.startsWith("/nemcard/itemimages/")) item.source_image_url = imageUrl.href;
    }
    products.set(url.href, item);
  });
  return [...products.values()].filter((r) => r.source_image_url && matchesPrintingNumber(r.product_title ?? "", row.card_number));
}

export async function fetchPublic(url) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000), headers: { "user-agent": "PriceDM-local-image-review/1.0" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

export async function main(argv = process.argv.slice(2)) {
  const [input, output, limitArg] = argv;
  if (!input || !output) throw new Error("Usage: node scripts/research-card-image-candidates.mjs audit-input.json output-directory [limit]");
  const all = JSON.parse(await readFile(input, "utf8")).filter((r) => r.image_width != null && r.image_width < 300);
  const limit = limitArg == null ? all.length : Number(limitArg);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid limit");
  const rows = all.slice(0, limit), results = [];
  await mkdir(path.join(output, "candidates"), { recursive: true });
  let cursor = 0, checkpoint = Promise.resolve();
  async function worker() {
    for (;;) {
      const row = rows[cursor++];
      if (!row) return;
      const search_url = `https://www.nemcard.com/view/search?search_keyword=${encodeURIComponent(row.card_number)}`;
      const result = { print_id: row.print_id, official_card_id: row.official_card_id, card_number: row.card_number, card_name: row.card_name,
        search_url, candidates: [], adoption: "held", rights_review: "permission_not_established",
        terms_url: "https://www.nemcard.com/view/guide" };
      try {
        const html = await (await fetchPublic(search_url)).text();
        if (/Just a moment|captcha/i.test(load(html)("title").text())) throw new Error("Access challenge; no bypass attempted");
        const candidates = extractCandidates(html, row, search_url);
        for (const candidate of candidates) {
          const entry = { ...candidate, number_match: true, identity_review: "pending_artwork_border_rarity_printed_text_review", rights_review: "permission_not_established" };
          try {
            const bytes = Buffer.from(await (await fetchPublic(candidate.source_image_url)).arrayBuffer());
            entry.native = await describe(bytes);
            entry.quality_review = entry.native.width >= 384 ? "pending_native_detail_visual_review" : "insufficient_native_width";
            const relative = `candidates/${row.print_id}-${sha256(bytes)}.source`;
            await writeFile(path.join(output, relative), bytes);
            entry.local_source = relative;
            if (entry.native.width >= 384) {
              const webp = await sharp(bytes).resize({ width: 384, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
              entry.after = await describe(webp);
              entry.proposed_image_key = `reviewed/${row.official_card_id}-sha256-${entry.after.sha256}`;
              entry.local_comparison = `candidates/${row.print_id}-${entry.after.sha256}.webp`;
              await writeFile(path.join(output, entry.local_comparison), webp);
            }
          } catch (error) { entry.error = error.message; }
          result.candidates.push(entry);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        result.search_status = candidates.length ? "number_matched_candidates_found_not_adopted" : "no_exact_number_candidate_in_search_results";
      } catch (error) { result.search_status = `error: ${error.message}`; }
      results.push(result);
      const snapshot = JSON.stringify(results, null, 2) + "\n";
      checkpoint = checkpoint.then(() => writeFile(path.join(output, "external-candidates.json"), snapshot));
      await checkpoint;
      if (results.length % 25 === 0) console.log(`Researched ${results.length}/${rows.length}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await Promise.all([worker(), worker()]);
  results.sort((a,b) => a.print_id - b.print_id);
  await writeFile(path.join(output, "external-candidates.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ researched: results.length, with_candidates: results.filter((r) => r.candidates.length).length, adopted: 0 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
