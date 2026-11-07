# DM26-EX5 card database release candidate

Card DB preparation is complete for 115 official prints: 86 existing canonical
IDs reused, 24 canonical names created for 29 prints, one product. Six signed
prints and all image publication are excluded. No production writes performed.

Artifacts under `.local/dm26ex5-official/`:

- `release-candidate-manifest.json`: final per-ID REUSE/CREATE mapping, eight
  preliminary display-name resolutions and exact SQL hash.
- `release-candidate.sql`: real canonical IDs, atomic transaction, no synthetic
  ID remappings. SHA256 `fe1f7dab74e279fea3052fb18368741690c4fba1cd593044f3eac3974d40e267`.
- `release-exact-test.json`, `release-path-tests.json`, `release-search-test.json`,
  `release-ref-test.json`, `release-postgrest-test.json`: successful exact-SQL,
  RPC, RLS, HTTP and reference checks.

New names have no exact normalized canonical, alias or search-term match in the
live snapshot; official same-name product listings contain EX5 only. Four
similar existing names lack the P’S suffix or use 暗黒凰 rather than 暗黒神羅凰;
these are distinct official names, not fuzzy aliases. Eight preliminary display
names use official ID/number anchored official spelling. Existing canonical
attributes remain untouched; EX5-specific power/type/face text is print metadata.

Compatibility: production read-only confirmation reports 181 migrations and
pg_cron 1.6.4. Native PostgreSQL replay applies 180 migrations. The one omitted
schedule migration only invokes `private.retire_stale_game_rooms`, which reads
room presence and updates game_rooms. It does not touch cards, decks, prices or
search. Synthetic auth/realtime/storage baseline and PostgREST 16.5 were used;
these tests cover the card paths, not live Supabase services or cron execution.

Dedicated release session only:

1. Preserve existing work. Fetch `price-dm/main`, inspect worktrees and pending
   migration/release activity. Verify the project ref `fxhlobydispnbywxhirn` and
   current schema/index/RLS/migration history read-only. A changed snapshot or
   conflict must stop release. Do not run a blanket migration push.
2. Preserve/commit the reviewed source, manifest, exact SQL and test evidence.
   The current artifacts are not yet committed or pushed. Recheck SQL SHA256.
3. Use existing `production-db-guard.mjs` and project release checklist with
   explicit release authorization. Session settings in the SQL are an extra
   guard, not proof of connection identity or authorization. After the external
   project check, the dedicated runner must supply `price_dm.release_project_ref`
   = `fxhlobydispnbywxhirn` and `price_dm.release_candidate` = `DM26-EX5-115`.
4. Audit before counts/checksums for reused canonical rows, existing prints,
   decks, prices and unrelated products. Apply the exact committed SQL once,
   and compare expected additions (24 canonicals, 115 prints, one product;
   search terms resolved idempotently). SQL rejects snapshot/alias/lock/delete,
   product and print conflicts atomically. Do not bypass failed guards.
5. Verify official ID/number/product/face metadata, exact existing reference
   identities, authenticated and anon search/RLS, repeat no-change diff, and
   unchanged unrelated checksums. Retain the resulting DB IDs for new names.
   Post-commit rollback is a separate reviewed operation, not blind deletion.

Keep image_key unset until rights and decoded public hash proofs are verified.
Signed Felix still has conflicting third-party number denominators and remains
outside this official release. No new image/R2, main or Vercel action is part of
this candidate.
