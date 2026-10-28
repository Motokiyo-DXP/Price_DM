import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { describe } from "./audit-card-image-resolution.mjs";
import { buildMetadataPatch, buildMetadataRollback } from "./build-card-image-metadata-patch.mjs";

// Local preparation only. No fetch, SQL connection, upload, Git or deploy operation.
export async function verifyCandidate(row, candidate, snapshot) {
  if (!snapshot || snapshot.print_id !== row.print_id || snapshot.deleted_at != null
    || snapshot.manually_locked !== false || snapshot.official_card_id !== row.official_card_id
    || snapshot.card_number !== row.card_number) throw new Error("Print identity or lock conflict");
  if (!candidate.number_match || !candidate.local_source || !candidate.local_comparison) throw new Error("Missing candidate evidence");
  const [sourceBytes, outputBytes] = await Promise.all([readFile(candidate.local_source), readFile(candidate.local_comparison)]);
  const source = await describe(sourceBytes), after = await describe(outputBytes);
  if (source.sha256 !== candidate.native?.sha256 || after.sha256 !== candidate.after?.sha256) throw new Error("Candidate bytes drifted");
  if (source.width < 384 || after.width !== 384 || source.width <= row.before.width || source.height <= row.before.height) throw new Error("No native resolution improvement");
  const aspectChange = Math.abs(source.width / source.height - row.before.width / row.before.height) / (row.before.width / row.before.height);
  if (aspectChange > 0.03) throw new Error("Orientation or crop needs review");
  const regenerated = await sharp(sourceBytes).resize({ width: 384, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
  if ((await describe(regenerated)).sha256 !== after.sha256) throw new Error("Output is not the documented WebP q78 conversion");
  if (!/^[a-zA-Z0-9_+$-]+$/.test(row.official_card_id)) throw new Error("Unsafe official ID");
  const imageKey = `official/${row.official_card_id}-reviewed-sha256-${after.sha256}`;
  return { source, after, image_key: imageKey, relative_file: `${imageKey}.webp` };
}

export async function main(argv = process.argv.slice(2)) {
  const [candidatesFile, snapshotFile, metadataFile, output] = argv;
  if (!output) throw new Error("Usage: node scripts/prepare-card-image-release-bundle.mjs candidates.json snapshot.json metadata-evidence.json output-dir");
  const [rows, snapshots, metadata] = await Promise.all([candidatesFile, snapshotFile, metadataFile].map(async (f) => JSON.parse(await readFile(f,"utf8"))));
  const byId = new Map(snapshots.map((r) => [r.print_id, r]));
  if (new Set(rows.map((r) => r.print_id)).size !== rows.length) throw new Error("Duplicate candidate print IDs");
  // Never replace or merge an earlier release bundle.
  await mkdir(output);
  await mkdir(path.join(output,"candidate-assets","official"),{recursive:true});
  const prepared = [], held = [];
  for (const row of rows) {
    const choices = row.candidates.filter((c) => c.native?.width >= 384 && c.local_comparison).sort((a,b) => b.native.width-a.native.width);
    if (!choices.length) { held.push({ print_id:row.print_id, reason:"no_native_384px_candidate" }); continue; }
    // A failed first choice is held, not silently replaced by a different scan.
    const candidate = choices[0];
    try {
      const verified = await verifyCandidate(row,candidate,byId.get(row.print_id));
      await copyFile(candidate.local_comparison,path.join(output,"candidate-assets",verified.relative_file));
      prepared.push({ print_id:row.print_id, official_card_id:row.official_card_id, card_number:row.card_number,
        before:byId.get(row.print_id), before_asset:row.before, source_url:candidate.source_image_url, product_url:candidate.product_url,
        ...verified, original_source_file:candidate.local_source,
        permission:{ status:"user_reports_approval_via_private_DM",provider_and_conditions:"not_disclosed",blanket_candidate_approval:false },
        print_review:{artwork:"pending",border:"pending",rarity:"pending",printed_text:"pending"},
        upload_status:"not_uploaded", release_status:"candidate_only_not_authorized_for_application" });
    } catch(error) { held.push({print_id:row.print_id,reason:error.message}); }
  }
  await writeFile(path.join(output,"candidate-manifest.json"),JSON.stringify(prepared,null,2)+"\n");
  await writeFile(path.join(output,"held-manifest.json"),JSON.stringify(held,null,2)+"\n");
  await writeFile(path.join(output,"candidate-checksums.sha256"),prepared.map(r=>`${r.after.sha256}  candidate-assets/${r.relative_file}`).join("\n")+"\n");
  await writeFile(path.join(output,"metadata-evidence.json"),JSON.stringify(metadata,null,2)+"\n");
  await writeFile(path.join(output,"metadata-dry-run.sql"),buildMetadataPatch(metadata));
  await writeFile(path.join(output,"metadata-apply.sql"),buildMetadataPatch(metadata,{commit:true}));
  await writeFile(path.join(output,"metadata-rollback.sql"),buildMetadataRollback(metadata,{commit:true}));
  await writeFile(path.join(output,"image-replacements-apply.sql"),"-- No image UPDATE statements generated.\n-- Candidate assets are NOT an upload list.\n-- Exact print review, applicable permission conditions and verified upload remain pending.\n");
  const summary = { candidates_checked:rows.length, prepared_candidate_assets:prepared.length, held:held.length,
    metadata_rows:metadata.length, image_updates_authorized:0, production_writes:0,
    release_owner_status:"another_production_release_in_progress_preparation_only",
    snapshot_notice:"Saved preflight snapshot only; MUST refresh after competing release completes" };
  await writeFile(path.join(output,"summary.json"),JSON.stringify(summary,null,2)+"\n");
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
