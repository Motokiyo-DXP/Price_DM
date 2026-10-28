# Card image release — 2026-10-29 JST

The user designated this chat as the sole integration/release owner. The prior search release completed; baseline main and fixed Vercel Production alias were `02e714af00a952caf4689c49341ac989a0b5a921`, READY. Baseline Supabase project: `fxhlobydispnbywxhirn`, 181 migrations, latest `20261028040039`. No repair/reset or unrelated merge is part of this change.

## Scope and adoption decisions

- Original audit: 23,636 active images; 468 below 300px and 159 without dimension metadata.
- 227 candidate prints passed native dimensions/aspect/format/hash/q78 regeneration checks. Four have additional exact-print visual and official-text confirmation and are selected here. The remaining 223 are held because independent exact printed-text/visual confirmation is incomplete; they are not declared incorrect or approved based on a similarity score.
- Another 241 small prints remain unresolved: 237 had no exact-number candidate on the first NEM search page, and 4 had only a sub-384px candidate. This was not an exhaustive search of the entire web.
- Selected IDs: **12817** (DMRP09 5/102), **12827** (DMRP09 3/102), **13118** (DMRP08 G5/G5), **13610** (DMRP06 S6/S10). Both faces of the twinpact cards and the gold-frame/foil treatment of G5/G5 were compared, including costs, powers, abilities, flavor text, illustration, number and rarity. Native source dimensions are in `approved.json`; no interpolated source was counted as a recovered image.
- Permission basis: the user's confirmation that contacted parties permit website use for this task. The selected sources are NEM product pages with images under the NEM CDN path. No private DM text, contact identity, credentials or personal correspondence is retained or published. No shop policy alone is treated as a grant.
- The 159 metadata-only rows retain their image key, IDs and printing information; only NULL width/height/byte-size fields are filled from decoded R2 bytes.

`approved.json` maps exact print IDs, original keys, source URLs, output dimensions/hashes, permission basis and review evidence. `review-outcomes.json` records all 227 candidate decisions. Prior unresolved candidate provenance remains under `followup-20261028/`.

## Worker/cache compatibility and transaction safety

The existing image Worker accepts only `official/` and `sample/` namespaces. Earlier local candidate keys under `reviewed/` would not be served. The release uses **`official/<official_id>-reviewed-sha256-<full output SHA256>`**, with no Worker routing change, no old-object overwrite and no cache invalidation. A worker-level regression test verifies that the new namespace serves while the old `reviewed/` namespace is rejected.

`apply.sql` applies the four image references and 159 metadata rows in one transaction. Each image row checks ID, canonical ID, official ID/URL, number/product, lock/deletion state, old key/dimensions/bytes, image timestamp and row timestamp. Any row-count mismatch aborts the transaction. The metadata block likewise rejects stale rows. Re-execution aborts instead of silently applying a partial update. Do not execute until **all four** new R2 objects have been publicly GET-verified for HTTP 200, WebP decode, dimensions and SHA-256.

`dry-run.sql` ends with ROLLBACK. `rollback.sql` restores saved image keys/dimensions and the original metadata NULLs while checking the expected post-apply keys/values and identity/lock state. Old R2 assets remain intact; newly uploaded objects should be retained after any rollback. Backups/current object bytes and upload evidence are kept locally rather than publishing an environment or account data.

## Local validation before mutation

An isolated PostgreSQL/PGlite rehearsal used all **627** saved target rows: dry-run rollback, actual four-image/159-metadata apply, repeat-apply refusal, complete restoration of the saved snapshot, and lock-conflict abort all passed (`rehearsal.json`). Image tests include source/output tampering, wrong printing, missing review/permission, aspect changes, unsupported namespace and unchanged identity. The release SQL is data-only; no migration is added or rewritten.

This folder is a pre-apply plan until upload, DB and production-screen evidence is appended. A prepared or merged report alone is not proof that images changed in Production.
