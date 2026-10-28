import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe } from "./audit-card-image-resolution.mjs";
const text = (v) => v == null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
export function buildMetadataPatch(rows, { commit = false } = {}) {
  if (!rows.length || new Set(rows.map((r) => r.print_id)).size !== rows.length) throw new Error("Empty or duplicate metadata targets");
  for (const r of rows) {
    if (r.manually_locked !== false || !Number.isSafeInteger(r.print_id) || !Number.isSafeInteger(r.canonical_card_id)
      || !r.image_key || !r.verified?.sha256?.match(/^[a-f0-9]{64}$/)
      || ![r.verified.width,r.verified.height,r.verified.byte_size].every((n) => Number.isSafeInteger(n) && n > 0)
      || ["width","height","byte_size"].some((k) => r[`image_${k}`] != null && r[`image_${k}`] !== r.verified[k])) throw new Error(`Unsafe metadata target ${r.print_id}`);
  }
  const values = rows.map((r) => `(${r.print_id},${r.canonical_card_id},${text(r.official_card_id)},${text(r.image_key)},${r.verified.width},${r.verified.height},${r.verified.byte_size},${r.image_width ?? "null"}::integer,${r.image_height ?? "null"}::integer,${r.image_byte_size ?? "null"}::integer,${text(r.image_updated_at)}::timestamptz)`).join(",\n");
  return `-- Prepared locally only. Release owner must reverify R2 SHA-256 against metadata-evidence.json.\n-- No image key, card identity, printing information or image_updated_at is changed.\nbegin;\ndo $metadata_patch$\ndeclare affected integer;\nbegin\nwith expected(id,canonical_id,official_id,image_key,w,h,bytes,old_w,old_h,old_bytes,old_updated) as (values\n${values}\n), updated as (\nupdate public.card_prints p set image_width=coalesce(p.image_width,e.w),image_height=coalesce(p.image_height,e.h),image_byte_size=coalesce(p.image_byte_size,e.bytes)\nfrom expected e where p.id=e.id and p.canonical_card_id=e.canonical_id\nand p.official_card_id is not distinct from e.official_id and p.image_key=e.image_key\nand p.deleted_at is null and p.manually_locked=false\nand p.image_width is not distinct from e.old_w and p.image_height is not distinct from e.old_h\nand p.image_byte_size is not distinct from e.old_bytes and p.image_updated_at is not distinct from e.old_updated\nand (p.image_width is null or p.image_height is null or p.image_byte_size is null)\nreturning p.id) select count(*) into affected from updated;\nif affected <> ${rows.length} then raise exception 'Metadata snapshot conflict: expected ${rows.length}, updated %', affected; end if;\nend $metadata_patch$;\n${commit ? "commit" : "rollback"};\n`;
}

export function buildMetadataRollback(rows, { commit = false } = {}) {
  buildMetadataPatch(rows); // Same validated snapshot and target uniqueness requirements.
  const values = rows.map((r) => `(${r.print_id},${r.canonical_card_id},${text(r.official_card_id)},${text(r.image_key)},${r.verified.width},${r.verified.height},${r.verified.byte_size},${r.image_width ?? "null"}::integer,${r.image_height ?? "null"}::integer,${r.image_byte_size ?? "null"}::integer,${text(r.image_updated_at)}::timestamptz)`).join(",\n");
  return `-- Restore only this metadata patch; stop if any post-apply snapshot differs.\nbegin;\ndo $metadata_rollback$\ndeclare affected integer;\nbegin\nwith expected(id,canonical_id,official_id,image_key,w,h,bytes,old_w,old_h,old_bytes,old_updated) as (values\n${values}\n), restored as (\nupdate public.card_prints p set image_width=e.old_w,image_height=e.old_h,image_byte_size=e.old_bytes\nfrom expected e where p.id=e.id and p.canonical_card_id=e.canonical_id\nand p.official_card_id is not distinct from e.official_id and p.image_key=e.image_key\nand p.deleted_at is null and p.manually_locked=false\nand p.image_width=e.w and p.image_height=e.h and p.image_byte_size=e.bytes\nand p.image_updated_at is not distinct from e.old_updated returning p.id)\nselect count(*) into affected from restored;\nif affected <> ${rows.length} then raise exception 'Metadata rollback snapshot conflict: expected ${rows.length}, restored %', affected; end if;\nend $metadata_rollback$;\n${commit ? "commit" : "rollback"};\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const [input, baseUrl, output] = argv;
  if (!input || !baseUrl?.startsWith("https://") || !output) throw new Error("Usage: node scripts/build-card-image-metadata-patch.mjs audit-input.json https://image-base output-directory");
  const rows = JSON.parse(await readFile(input, "utf8")).filter((r) => r.image_width == null || r.image_height == null);
  await mkdir(output, { recursive: true });
  const evidence = [];
  for (const row of rows) {
    const parts = row.image_key.split("/");
    if (parts.some((s) => !s || s === "." || s === "..")) throw new Error("Unsafe image key");
    const url = `${baseUrl.replace(/\/$/, "")}/${parts.map(encodeURIComponent).join("/")}.webp`;
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`R2 image ${row.print_id}: HTTP ${response.status}`);
    const verified = await describe(Buffer.from(await response.arrayBuffer()));
    evidence.push({ ...row, verified, verified_url: url, verified_at: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await writeFile(path.join(output, "metadata-evidence.json"), JSON.stringify(evidence,null,2)+"\n");
  await writeFile(path.join(output, "metadata-dry-run.sql"), buildMetadataPatch(evidence));
  await writeFile(path.join(output, "metadata-apply.sql"), buildMetadataPatch(evidence,{commit:true}));
  await writeFile(path.join(output, "metadata-rollback.sql"), buildMetadataRollback(evidence,{commit:true}));
  console.log(JSON.stringify({ verified: evidence.length, sql_executed: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
