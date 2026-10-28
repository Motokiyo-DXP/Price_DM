# Card image resolution audit and selective resync

Date: 2026-10-28 JST. Source ref: `price-dm/main` at `6ad0f252c6564af7727252c9edbe40637f80f09c`.
The canonical checkout's existing edits were preserved. All implementation and outputs live in a dedicated worktree.

## Cause

`scripts/sync-dm-card-images.mjs` intentionally avoids enlargement, so a native 137px or 250px official image stays small. Its initial-import manifest skips existing IDs. The new **separate selective workflow** rechecks supplied IDs regardless of the import manifest, leaving initial import behavior unchanged.

Production read-only audit reproduced 23,636 active image records: 23,009 at least 384px wide, 218 below 200px, 250 between 200 and 299px, and 159 with missing dimensions. No records were 300–383px wide. Another printing of the same canonical card has a >=384px image for 274 of the 468 small prints; those images are not replacement authorization.

`audit-input.json` preserves all 627 candidate rows including the original metadata and locks. `original-audit.sql` is the supplied read-only SQL. `other-print-comparison.json` answers its alternate-print check, and `small-byte-review.json` contains its complete low-byte-size result.

## Completed audit result

- R2 objects: 627/627 decoded successfully. All 468 small-image dimensions **and byte sizes** matched the DB. All 159 dimension-unknown objects decoded to width 384px; no metadata was written back.
- Direct exact-ID official sources: 441 native low-resolution originals; no genuine improvement. Another 27 conventional JPG URLs returned 404. All 27 official detail pages were checked separately: their 43 linked face/promo images decoded at widths 137px (16), 191px (8) or 250px (19). None reached 384px. Links and native hashes/dimensions are in `official-alternatives.json`; different faces remain distinct and are not automatic substitutes.
- Low-resolution count before/after: **468 / 468**. Genuinely improved print list: **empty**. Approved uploads/DB updates: **0 / 0**. The unresolved print list is the complete `small.csv` (468 rows); the direct-source result and reason remain in `manifest.json` with separate detail-page evidence for 404s. No legitimate higher-resolution exact-print source was found in these inspected official assets. This is not an exhaustive search of every historical asset.
- Visual sample: the 137px examples (`dmr05-s01`, `dmx13-028`) visibly lose text/detail; the 250px `dmrp06-s06` is also intrinsically limited. Three dimension-unknown examples are already 384px; the horizontal card design was preserved. Eight additional >=384px objects were decoded, and three visually reviewed. The two smallest-file-size full-resolution cards (`dmex08-083`, `dmx22b-070`) are official handwritten designs, not evidence of compression damage. No broad visual-quality claim is made for all 23,009 full-resolution images.
- Rights/source verification: only public official assets were fetched for local inspection. No third-party scans, publication permission assumption, new production asset, or replacement approval was introduced. With no improvement candidate, rights approval remains pending rather than fabricated.
- Local preview: `http://localhost:3000/cards/official/resolution-audit/index.html` was served by `npm run dev` on confirmed port 3000 and inspected in the in-app browser. It displays current image samples and all 627 results, with an explicit zero-improvement statement. `preview.html` is the saved report; the served copy is a local ignored artifact under `public/cards/official/`.

## Running another audit

```powershell
npm run images:audit:resolution -- reports/card-image-resolution/audit-input.json https://dm-price-tracker-card-images.tcg-price-checker.workers.dev .local/new-resolution-audit
npm run test:images
```

Use a fresh output directory for a new dated audit. The JSON input is a fresh, stable DB export of selected active prints, not the initial-import manifest. The program generates small/unknown CSVs, a per-print manifest with actual decoded dimensions, bytes, SHA-256, source URL and dimensions, and an outcome. Checkpoint writes preserve completed records during a long run. At most two readers run concurrently, with delays and no upload credentials.

Only genuinely larger native sources with compatible aspect ratio are staged as 384px-wide q78 WebP. File names include the complete output SHA-256, and existing bytes are preserved. Generated candidates remain `pending_review`: native dimensions do not prove detail quality, rights or illustration identity. Blurry enlarged originals, wrong illustrations and special faces require human visual review. Broken assets, lock uncertainty, unavailable sources, orientation/crop mismatches and already-large objects are held. Unknown dimensions are decoded separately; a horizontal 384x275 image is not treated as a small portrait.

The automatic resolver checks only the exact conventional official-ID JPG. A 404 does not mean no official asset exists: multi-face cards and older promo URLs may use other filenames. Those need a separate official-detail-page review, captured in `official-alternatives.json`; the program does not guess a face or substitute an OG image. No third-party scans are used.

## Release procedure (separate integration/release session)

1. Administrator designates the sole production release owner and confirms competing release operations stopped. Verify `price-dm` remote, clean release branch, current main SHA, migration history and possible conflicts. No production writes are authorized by this report.
2. Refresh the DB snapshot and rerun the read-only object audit. Preserve old R2 objects and the before manifest. For each candidate independently confirm official ID, number, product, border, illustration, rarity treatment and face. Record `source_identity=exact_print_confirmed`, `identity_evidence`, `quality_evidence`, `rights_review=approved`, and `rights_evidence` only after actual review. Official hosting alone does not establish permission to republish. Obtain operator rights authorization; do not use shop scans without separate authorization.
3. Upload only reviewed staged new keys using the authorized release process. Never overwrite old keys. GET the published new object, decode dimensions, and verify the full SHA-256 equals the staged output; then record `upload_verified_sha256`. Preserve upload evidence separately. The audit program has no upload operation.
4. Set `review_outcome=approved` only for those reviewed, uploaded and verified records. Generate a review-only patch:

   ```powershell
   npm run images:audit:resolution -- reviewed-manifest.json https://dm-price-tracker-card-images.tcg-price-checker.workers.dev .local/release-review --sql-only
   ```

5. The generated SQL uses `BEGIN`/`ROLLBACK`, updates only image fields, and guards print ID, canonical ID, official ID/URL, number, product, original key/dimensions/bytes/timestamp, lock and deletion state. Verify exact affected IDs in the dry run. Any unexpected count or changed snapshot requires stopping and refreshing review. For actual application, the release owner prepares and commits the reviewed source patch before executing the separately authorized transaction. No migration was added by this feature.
6. Verify production URLs, decoded dimensions/hash and actual screen behavior after application; account for browser/CDN caches using the new versioned keys. Record exact improved IDs and post-release counts. Retain old keys for rollback. This report does not establish a production fix.

## Validation

Image tests passed (21 existing image tests plus 12 sync/audit tests). They exercise native high resolution, 137px/250px rejection, portrait/horizontal faces, wrong printing, locks and unknown locks, already-improved rows, broken objects, SQL approval/upload guards and versioned keys. A CLI-level test exercises GET-only access, missing objects, and unknown dimensions. `npm run typecheck` and `npm run build` passed; build reported existing CSS autoprefixer warnings. Representative real objects were decoded and visually inspected; the local report browser check is separate from physical-device or production release proof.
