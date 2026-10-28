import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { officialCardId, officialImageUrl, imageStorageId } from "./sync-dm-card-images.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function describe(bytes) {
  const { width, height, format } = await sharp(bytes).metadata();
  if (!width || !height) throw new Error("Missing decoded dimensions");
  // Force a complete decode: metadata alone does not detect truncated objects.
  await sharp(bytes).stats();
  return { width, height, format, byte_size: bytes.length, sha256: sha256(bytes) };
}

export async function prepareReplacement(row, beforeBytes, sourceBytes, sourceUrl) {
  const before = await describe(beforeBytes);
  const source = await describe(sourceBytes);
  const base = { ...row, before, source, source_image_url: sourceUrl,
    source_identity: "pending_exact_print_visual_review", rights_review: "pending", review_outcome: "unresolved" };
  if (row.manually_locked !== false) return { record: { ...base, reason: "locked_or_unknown_lock" } };
  if (!row.official_card_id || officialCardId(row.official_url) !== row.official_card_id || sourceUrl !== officialImageUrl(row.official_card_id)) {
    return { record: { ...base, reason: "printing_identity_mismatch" } };
  }
  if (before.width >= 384) return { record: { ...base, reason: "already_target_width" } };
  if (source.width < 384 || source.width <= before.width || source.height <= before.height) {
    return { record: { ...base, reason: "no_higher_native_resolution_source" } };
  }
  if (Math.abs(source.width / source.height - before.width / before.height) / (before.width / before.height) > 0.03) {
    return { record: { ...base, reason: "orientation_or_crop_mismatch" } };
  }
  const bytes = await sharp(sourceBytes).resize({ width: 384, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
  const after = await describe(bytes);
  const proposed_image_key = `official/${imageStorageId(row.official_card_id)}-sha256-${after.sha256}`;
  return { bytes, record: { ...base, after, proposed_image_key, review_outcome: "pending_review",
    reason: "native_dimensions_improved_quality_and_exact_print_review_required" } };
}

export function buildDryRunSql(records) {
  const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const approved = records.filter((r) => r.review_outcome === "approved");
  const statements = approved.map((r) => {
    if (r.manually_locked !== false || r.source_identity !== "exact_print_confirmed" || r.rights_review !== "approved"
      || !r.identity_evidence || !r.quality_evidence || !r.rights_evidence
      || r.upload_verified_sha256 !== r.after?.sha256 || !/^[a-f0-9]{64}$/.test(r.after?.sha256 ?? "")
      || !Number.isSafeInteger(r.source?.width) || !Number.isSafeInteger(r.source?.height)
      || !Number.isSafeInteger(r.before?.width) || !Number.isSafeInteger(r.before?.height)
      || r.source.width < 384 || r.before.width >= 384 || r.after?.width !== 384
      || r.source.width <= r.before.width || r.source.height <= r.before.height
      || Math.abs(r.source.width / r.source.height - r.before.width / r.before.height) / (r.before.width / r.before.height) > 0.03
      || r.source_image_url !== officialImageUrl(r.official_card_id)
      || officialCardId(r.official_url) !== r.official_card_id
      || r.proposed_image_key !== `official/${imageStorageId(r.official_card_id)}-sha256-${r.after.sha256}`
      || !Number.isSafeInteger(r.print_id) || !Number.isSafeInteger(r.after.height) || !Number.isSafeInteger(r.after.byte_size)) {
      throw new Error(`Unsafe approval for print ${r.print_id}`);
    }
    return `update public.card_prints set image_key=${quote(r.proposed_image_key)}, image_width=384, image_height=${r.after.height}, image_byte_size=${r.after.byte_size}, image_updated_at=pg_catalog.now()\nwhere id=${r.print_id} and official_card_id=${quote(r.official_card_id)} and canonical_card_id=${quote(r.canonical_card_id)}\n  and official_url is not distinct from ${quote(r.official_url)} and card_number is not distinct from ${r.card_number == null ? "null" : quote(r.card_number)}\n  and product_name is not distinct from ${r.product_name == null ? "null" : quote(r.product_name)}\n  and deleted_at is null and manually_locked=false and image_key=${quote(r.image_key)}\n  and image_width is not distinct from ${r.image_width ?? "null"} and image_height is not distinct from ${r.image_height ?? "null"}\n  and image_byte_size is not distinct from ${r.image_byte_size ?? "null"}\n  and image_updated_at is not distinct from ${r.image_updated_at == null ? "null" : quote(r.image_updated_at)}\nreturning id, image_key;`;
  });
  return `-- REVIEW ONLY. ROLLBACK is intentional. Release owner must verify uploaded SHA-256 and affected IDs.\nbegin;\n${statements.join("\n")}\nrollback;\n`;
}

const csv = (rows) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [keys.map(cell).join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n") + "\n";
};
async function getBytes(url) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function main(argv = process.argv.slice(2)) {
  const [input, imageBase, output, mode] = argv;
  if (!input || !output || !imageBase?.startsWith("https://")) throw new Error("Usage: node scripts/audit-card-image-resolution.mjs input.json https://image-base output-dir [--sql-only]");
  const rows = JSON.parse(await readFile(input, "utf8"));
  await mkdir(output, { recursive: true });
  if (mode === "--sql-only") {
    await writeFile(path.join(output, "review-only.sql"), buildDryRunSql(rows));
    return;
  }
  const records = [];
  await writeFile(path.join(output, "small.csv"), csv(rows.filter((r) => r.image_width != null && r.image_width < 300)));
  await writeFile(path.join(output, "unknown-dimensions.csv"), csv(rows.filter((r) => r.image_width == null || r.image_height == null)));
  // At most two readers; neither reader has credentials or an upload operation.
  let cursor = 0;
  let checkpoint = Promise.resolve();
  async function worker() {
  for (;;) {
    const row = rows[cursor++];
    if (!row) break;
    const record = { ...row, review_outcome: "unresolved" };
    try {
      const key = row.image_key.split("/");
      if (key.some((s) => !s || s === "." || s === "..")) throw new Error("Unsafe existing key");
      const existingUrl = `${imageBase.replace(/\/$/, "")}/${key.map(encodeURIComponent).join("/")}.webp`;
      const beforeBytes = await getBytes(existingUrl);
      record.before = await describe(beforeBytes);
      record.existing_url = existingUrl;
      record.db_dimensions_match = row.image_width === record.before.width && row.image_height === record.before.height;
      record.db_bytes_match = row.image_byte_size === record.before.byte_size;
      // Unknown-size and full-size objects are audited separately, never inferred small.
      if (record.before.width >= 384) record.reason = "already_target_width_visual_quality_unreviewed";
      else if (!row.official_card_id || officialCardId(row.official_url) !== row.official_card_id) record.reason = "missing_or_mismatched_official_identity";
      else {
        const sourceUrl = officialImageUrl(row.official_card_id);
        record.source_image_url = sourceUrl;
        await new Promise((resolve) => setTimeout(resolve, 250));
        const sourceBytes = await getBytes(sourceUrl);
        const prepared = await prepareReplacement(row, beforeBytes, sourceBytes, sourceUrl);
        Object.assign(record, prepared.record);
        if (prepared.bytes) {
          const assetDir = path.join(output, "staged", "official");
          await mkdir(assetDir, { recursive: true });
          const assetPath = path.join(output, "staged", `${record.proposed_image_key}.webp`);
          try { await writeFile(assetPath, prepared.bytes, { flag: "wx" }); }
          catch (error) {
            if (error.code !== "EEXIST" || sha256(await readFile(assetPath)) !== record.after.sha256) throw error;
          }
          await mkdir(path.join(output, "evidence"), { recursive: true });
          await writeFile(path.join(output, "evidence", `${row.print_id}-before.webp`), beforeBytes);
          await writeFile(path.join(output, "evidence", `${row.print_id}-source.jpg`), sourceBytes);
        }
      }
    } catch (error) { record.reason = `asset_error: ${error.message}`; }
    records.push(record);
    const snapshot = JSON.stringify(records, null, 2) + "\n";
    checkpoint = checkpoint.then(() => writeFile(path.join(output, "manifest.json"), snapshot));
    await checkpoint;
    if (records.length % 50 === 0) console.log(`Audited ${records.length}/${rows.length}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  }
  await Promise.all([worker(), worker()]);
  records.sort((a, b) => a.print_id - b.print_id);
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(records, null, 2) + "\n");
  await writeFile(path.join(output, "review-only.sql"), buildDryRunSql(records));
  const summary = { audited: records.length, approved: 0, pending_review: records.filter((r) => r.review_outcome === "pending_review").length,
    unresolved: records.filter((r) => r.review_outcome === "unresolved" && !(r.before?.width >= 384)).length,
    already_target_width: records.filter((r) => r.before?.width >= 384).length,
    reasons: records.reduce((out, r) => ({ ...out, [r.reason]: (out[r.reason] ?? 0) + 1 }), {}) };
  await writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
