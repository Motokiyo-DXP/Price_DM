# DM26-EX5 image follow-up

The operator confirmed on 2026-11-08 that permission for this site's card images
was obtained at site creation and settled in prior GPT discussions. This release
uses that explicit confirmation. It does not claim a newly obtained permission
document or extend the release to the six unconfirmed signed prints.

## Scope and evidence

115 already registered official prints, product 268 / DM26-EX5. No canonical,
print identity, product, search term, deck or price mutation is intended. Only
previously empty card_prints.image_key and its trigger-maintained updated_at may
change. Existing artwork for other prints remains untouched.

The image manifest binds every exact DB print ID, canonical ID, official ID and
number to the image URL observed in the archived official detail page. Both
card-img and og:image must agree. Twinpact pages explicitly use the observed
`a.jpg` image, depicting the full physical card; no second print is invented.
The previously reviewed 44080 slash spelling exception is checked explicitly,
without a fuzzy name merge. Original image and HTML hashes, source dimensions,
WebP hashes, dimensions, sizes and mapping evidence are retained in manifest.json.

Sources are decoded and converted using the existing 384px, quality-78 WebP
convention. Source files remain local. Content-addressed image keys prevent
replacement of a different cached object. Public GET, exact SHA-256, dimensions
and WebP decode must pass for all 115 before the production SQL is generated.

## Preparation and release

Use the dedicated image feature worktree. Do not modify the dirty main checkout
or the previous EX5 preparation worktree. Example preparation commands:

```
node scripts/dm26ex5-images.mjs stage <existing-official-artifact-directory>
node scripts/test-dm26ex5-images.mjs <existing-official-artifact-directory>
npm run test:images
npm run test:db-safety
```

Stage requires a read-only EX5 print snapshot at .local/ex5-image-before.json.
It reuses archived official HTML, and resumes from locally cached original bytes.
Review and commit manifest.json, apply.sql, the scripts and test evidence before
production. Merge only this feature PR after required CI succeeds.

In the independent clean main release clone, fetch price-dm/main and verify HEAD
equals remote main, the correct GitHub remote, and no other release is running.
Copy staged .local/ex5-images assets from the image worktree. With the explicit
PRICE_DM_PRODUCTION_RELEASE=1 environment and clean-main guard satisfied:

```
node scripts/dm26ex5-images.mjs publish
node scripts/dm26ex5-images.mjs production-payload
```

Only missing objects may be uploaded. An existing object with different bytes
stops the release. The worker is not redeployed. A mismatch or expired/missing
public proof prevents payload generation. Execute the resulting ignored
.local/ex5-images-production.sql only against fxhlobydispnbywxhirn.

The transaction uses the shared production-release advisory lock plus table
locks, migration-count and exact ID/number/product/lock/delete/image guards.
It snapshots protected tables and verifies that existing unrelated rows remain
identical before commit. Reapplying identical keys issues no updates.

After apply, verify all 115 DB keys against the committed manifest, anonymous
PostgREST image retrieval and the public card-detail/search image display,
especially canonical 44114 (Magia). Check public images decode in the browser.
Persist production results in .local; no real user fixtures are created.

## Failure and reversal

Any SQL error aborts the entire transaction. Do not retry blindly; first inspect
actual rows and concurrent release state. Uploaded content-addressed objects may
remain unreferenced after a failed DB apply without affecting existing artwork.

Before commit, ROLLBACK cancels every DB change. After commit, a reversal requires
a separate reviewed transaction holding the same locks, joining all exact print,
canonical, official, number and product identities in the committed manifest,
and clearing only keys still equal to that release's exact image_key. All 115
pre-release image values were NULL. Preserve any subsequently edited or locked
row and stop on a mismatch; do not delete prints, canonical rows or R2 objects.

## Verification limits

The native PostgreSQL fixture reuses the previous 180-migration template, with
synthetic card/auth/deck/price data and a synthetic 181-entry history. The omitted
pg_cron migration schedules game-room retention and has no image-table path.
This is not a claim to reproduce Supabase Auth or Storage services. Production
HTTP/DB/browser checks are separate evidence. No application deployment is
needed for a data-only image-key update.
