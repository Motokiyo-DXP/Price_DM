# DM26-EX4 completion release

This follows the stopped investigation in `DM26EX4_COMPLETION_STOP_REPORT.md`.
The 7 exact, number-scoped mappings in `scripts/dm26ex4-canonical-mappings.json`
were checked against live official detail pages on 2026-10-10 and both printed
face names in the already downloaded official product images. They preserve
existing canonical IDs and do not change normalization for other cards.

Expected input: 162 print faces, 114 new prints, 54 new canonical cards, 97
existing canonical cards reused, 48 existing print IDs preserved. 159 official
preview images and 121 unverified DMwiki detail records are staged. 26 unknown
number slots, 3 images and 41 detail records remain held. Official catalog IDs
are never invented. Existing formal or manually locked metadata is preserved.

Validation: 7 mapping regression cases plus 12 other DM26-EX4 cases, 73 existing
import tests, 8 DB safety tests, typecheck; isolated PostgreSQL import/reimport,
formal canonical row equality and all 48 old print identities. The existing deck
editor was temporarily connected to the isolated PostgreSQL RPC implementation.
Reading search, combined cost/civilization/type/race/power/text filters, adding a
card, mana/civilization analysis and decoded local artwork were verified in the
browser. The disposable route and servers were removed/stopped afterwards.

Release only from clean `main` matching freshly fetched `price-dm/main`, after
`assertProductionDbRelease`, with `PRICE_DM_PRODUCTION_RELEASE=1`:

1. Link to the verified Supabase project and run guarded production migration
   `--dry-run --include-all`. Only the source-metadata migration may be pending.
2. Run `release-dm26ex4-images.mjs` using staged WebPs. This verifies SHA256 before
   upload, refuses existing mismatched objects, GETs the public URL and fully
   decodes every WebP. Save the public image proofs before generating image SQL.
3. Commit the public proof and final SQL/report; refresh the clean release main.
4. Recheck migration history, current data and concurrent activity, apply the
   committed migration, then apply `build-dm26ex4-complete.mjs` output atomically.
5. Verify print IDs, source ownership, field counts, image GET/browser decode,
   unrelated-data checksums and read-only repeat dry-run.

Future official updates: reconcile print identity with
`build-dm26ex4-official-update.mjs`. Explicit observed/official-absent/unavailable
states prevent unknown values from clearing metadata. Only source-owned values
or unchanged equal values may be upgraded; edited/locked fields stop the update.
Artwork replacement checks the old preview ownership and newly verified public
image. Do not pass existing preview prints through a generic overwrite importer.
