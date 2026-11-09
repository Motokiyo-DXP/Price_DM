# Rarity and filter release candidate - 2026-11-09

Scope: commits 5b68da6, 839022c, 0fcff96 plus the committed exact release artifacts here. No dirty changes from the canonical checkout are included.

- Production project: fxhlobydispnbywxhirn (dm-price-tracke).
- Vercel: dm-price-tracker / prj_9lr9Tssj42g9WVmvVnY1Z1149Oc2 / team_QEbnFBq6zJM8CUvri5GtLxL3.
- Baseline main and serving application: acf48c58fe5f39f096e7b09890aad3ea5f81898d.
- Schema: exactly 20261108132726_card_print_rarity_filters.sql. Existing history: 181 migrations, latest 20261028040039. No history repair or include-all operation.
- Data: 23,751 prints; verified 23,746; unverified 5 (4 missing official IDs, 1 official-number mismatch). Leave these five NULL and searchable when no rarity is selected.
- Changes only rarity_codes/rarity_provenance. The transaction guards the complete protected print-row hash, exact migration history, count, manual locks, deleted state and old values; it holds the shared production release advisory lock. All other print columns must retain their exact hash.
- Full card_prints rows, original function definitions/ACL/owners/RLS and deployment settings are privately backed up in .local/rarity-release. This is changed-scope recovery; hosted full-DB PITR is disabled and no physical backup was listed.
- exact-test.json verifies restoration of every production print and original function definitions, the exact committed schema/apply/rollback SQL, idempotency, lock conflicts and preservation of all protected print values on native PostgreSQL 17. No hosted mutation was used for this test.

## Release order

1. Required CI on this PR; latest main and release ownership recheck.
2. Temporarily set only Vercel autoAssignCustomDomains=false, recording the old value. Current production remains serving its existing deployment.
3. Merge the approved/tested PR. In this independent clean main clone verify HEAD==price-dm/main and assertProductionDbRelease with PRICE_DM_PRODUCTION_RELEASE=1.
4. Supabase CLI 3.0.0 dry-run must list only the schema migration above. Apply exactly that migration with --remote=fxhlobydispnbywxhirn --skip-vault; never run the historical wrapper's obsolete --linked flag or modify migration history directly.
5. Execute this committed apply.sql against the same project, then compare counts, exact per-print rarity/provenance, protected hashes and existing ACL/owner/RLS.
6. Verify the same main SHA's production deployment, exercise the changed behavior, then promote it and verify the fixed production alias. Restore autoAssignCustomDomains=true (the baseline value).
7. Record actual release results separately. Release completion does not mean all-card rarity coverage: the five unresolved prints remain unresolved.

Data rollback: rollback-data.sql requires exact post-release values and protected rows; any changed lock/value stops the entire transaction. App/search rollback: restore prior application, then docs/rarity/rollback-search.sql (keeps enriched columns/data), or the privately backed-up exact original definitions. No migration history repair is part of rollback.
