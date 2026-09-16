# Rule Source Watcher v1

Status: VALIDATED ON FEATURE BRANCH — PR #8 MERGE PENDING

## Purpose

Detect changes to the official Duel Masters comprehensive game rules without an AI API.

```text
source_manifest.yaml
  -> fetch official Rule Index
  -> extract Version / updated date / PDF URL
  -> compare with manifest baseline
  -> NO_CHANGE / CHANGE_DETECTED
```

## Commands

Live local check:

```bash
npm run rules:check
```

Fixture-only unit tests:

```bash
npm run test:rule-source
```

For deterministic local inspection, `--index-file <path>` may be passed directly to `scripts/check-dm-rule-source.mjs`. CI runs only `test:rule-source` and never fetches the official site.

## Result contract

- `NO_CHANGE`: all three observed fields match the manifest; exit 0.
- `CHANGE_DETECTED`: one or more fields differ; changes are listed; exit 0.
- `NETWORK_ERROR`: fetch failed or returned a non-success HTTP status; non-zero exit.
- `PARSER_ERROR`: Version, date, PDF URL, or a unique comprehensive-rules entry cannot be extracted; non-zero exit.
- `MANIFEST_ERROR`: required baseline data is missing, ambiguous, invalid, or unreadable; non-zero exit.

The command prints JSON for successful comparisons. It never updates `source_manifest.yaml`; review and baseline updates remain explicit follow-up work.

## Extraction boundary

The watcher selects the anchor whose visible text identifies `デュエル・マスターズ総合ゲームルール`, extracts its `Ver.` value and PDF link, then reads the adjacent `day01` update date. Dates are normalized to `YYYY-MM-DD`, and relative PDF links are resolved against the manifest's official index URL.

## Validation

- Current official-structure fixture -> `NO_CHANGE`
- Changed Version/date/PDF fixture -> `CHANGE_DETECTED`
- Missing date -> `PARSER_ERROR`
- Invalid manifest -> `MANIFEST_ERROR`
- Fetch failure -> `NETWORK_ERROR`
- Live official Rule Index check: `NO_CHANGE` (`1.51`, `2026-07-23`, `https://dm.takaratomy.co.jp/img/dm_rule_20260723_5.pdf`)
- Pull-request CI: PASS — run `35050706318`

## Deferred scope

- Q&A incremental watcher
- scheduler
- notification
- automatic manifest updates
- PDF download, hashing, and section diff
- AI-based interpretation of changed rules

`automationGap: scheduler, notification, and downstream PDF section-diff handling remain deferred.`

`repoMapImpact: UPDATE_REQUIRED` — the repository gains a Rule Source automation script, fixture tests, npm entry points, and CI coverage.
