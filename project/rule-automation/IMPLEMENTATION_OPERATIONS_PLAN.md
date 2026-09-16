# Implementation / Operations Plan

Status: ACTIVE
Policy generation: v5 / Automation First
Last updated: 2026-09-16

## 1. Automation First

定型的・反復的・決定論的な処理は、AIへ毎回実行させない。

次の運用を基本とする。

```text
AIに毎回処理させる
```

ではなく、

```text
AIに一度仕組みを作らせる
↓
以降は script / CI / scheduler で再実行
```

とする。AIはPipeline中央ではなくException Branchへ置く。

## 2. 工程分類

### AUTOMATED

通常運用でAI不要。

例：

- Fetch
- Parse
- Normalize
- Validate
- Diff
- Dry-run
- Test
- Build
- Audit
- Schedule
- Backup
- Notify

### HUMAN_GATE

機械処理できるが、Productionへの重要変更には人間の明示承認が必要。

例：

- Production DB mutation
- destructive migration
- mass update
- Rule authorityのAUTO昇格

### AI_ON_EXCEPTION

通常はAutomationとし、次の場合のみAIを使用する。

- unknown format
- parser failure
- semantic conflict
- unknown Rule
- unknown card type
- unexplained test failure

### AI_DESIGN

設計・意味判断にAIを使用する。

例：

- Architecture
- 新Mechanic
- Rule interpretation
- DB schema changes
- exception policy

## 3. AI_ALWAYSは禁止

定型工程について、次の構造を新設しない。

- 毎回ChatGPTへデータを渡す
- 毎回CodexにRepo全体を再調査させる
- 毎回AIにDB差分を判断させる

## 4. Track構成

### Track R — Rule Automation

- R0 Rebaseline: COMPLETE
- R1 Stage 4.5 DRAW Production Shadow: COMPLETE
- R2 DRAW Shadow Validation: COMPLETE
- R3 DISCARD Design: COMPLETE
- R4 DISCARD Pure Rule Core + test-only Shadow: COMPLETE
- R5 DISCARD Production Shadow feasibility: DEFERRED_NO_SEMANTIC_INTENT
- R6 DISCARD Test Shadow Validation: COMPLETE / MAIN via PR #11
- R7 TAP Design: COMPLETE / MAIN via PR #12
- R8 TAP Pure Core + test-only Shadow: COMPLETE / MAIN via PR #13
- R9 behavior-preserving Legacy TAP helper extraction: COMPLETE / MAIN via PR #14
- R10 TAP Production Shadow: COMPLETE / MAIN via PR #15
- R11 TAP Validation: validated on feature branch; COMPLETE after merge

DRAWではLegacy結果のみをProduction authorityとして利用し、Rule Core結果は比較専用とする方針を維持したままValidationまで完了した。

DISCARDは1枚のalready-selected cardについて`hand -> graveyard`のMove Semanticsを検証する。Pure Rule Coreとtest-only Shadowを先行し、generic manual moveとsemantic DISCARD intentを識別できるまでProduction Shadow接続を行わない。

既存Production UIにsemantic DISCARD intentがないため、R5は意図的にDeferredとする。この未実装はRule本筋全体のBlockerではない。次SliceはTAPを選定し、mana zoneのalready-selected 1枚に限定したDesign Gateを完了した。設計根拠と将来のProduction Shadow条件は`VERTICAL_SLICE_TAP.md`を参照する。

### Track C — CI

COMPLETE。Minimal CIはPR #6でmainへ導入済み。

目標：

```text
PR
↓
npm ci
↓
typecheck
↓
relevant tests
↓
build
```

Rule Engineの安定入口は`npm run test:rule`として運用中。

### Track D — Card Data Pipeline

既存の以下を再利用する。

- crawler
- checkpoint
- resume
- validator
- builder
- SQL generation
- idempotent apply
- audit

追加課題はSmall / Incremental Importer。公式URLからの通常取得・JSONL生成・DB diffをChatGPT必須にしない。AIは未知HTMLやcollision等の場合のみ使用する。

### Track S — Rule Source Automation

Rule Source Watcher v1はCOMPLETE、PR #8でmainへmerge済み。Version / 更新日 / PDF URLをfixture CIとlocal live checkで比較できる。

目標：

```text
Rule index
↓
version comparison
↓
変更なし → end
↓
新PDF snapshot
↓
hash
↓
section diff
↓
changed sectionsのみAI
```

公式Q&Aもincrementalにする。

Q&A incremental watcher、PDF section diff、scheduler、notificationはparallel infrastructure trackとして継続するが、Rule Core本筋を不要にBlockしない。

### Track O — Operations

将来対象：

- scheduler
- notifications
- backup policy
- restore verification
- audit scheduling

重いFull Crawlを毎回実行せず、次を基本とする。

```text
lightweight detection
↓
change detected
↓
heavy sync
```

## 5. Token Policy

AIへ渡すのはRaw Full Dataではなく、次を優先する。

- Diff
- Exception
- Unknown
- Conflict

悪い例：カード23,000件を毎回AIへ送る。

良い例：

```text
new: 81
changed: 3
conflict: 1
```

Ruleについても全文ではなく変更条文を優先する。

## 6. Codex Policy

Codexへ毎回、次をさせない。

- Repo全体再調査
- 同じDB schema確認
- 同じtest commandの組み立て

次の正本・成果物を優先して再利用する。

- `PROJECT_STATE.md`
- `REPO_MAP.md`
- `IMPLEMENTATION_OPERATIONS_PLAN.md`
- source manifests
- scripts
- CI result

## 7. Automation Build Rule

今後Codexが反復可能な作業を行う場合、その場限りの処理ではなく、次の形で残せるかを必ず検討する。

- 再実行可能なscript
- stable npm command
- CI job
- scheduled job

ただし、一度しか使わない処理まで無理にFramework化しない。

## 8. Human Gate

最低限、次は人間承認を残す。

- Production DB mutation
- destructive migration
- mass update
- permission scope変更
- Rule CoreをProduction authorityへ昇格
- irreversible production operation

## 9. BLOCKED_SPEC

次が必要になった場合、Codexは独断で設計を拡張しない。

- DB Schema変更
- Online Protocol変更
- Rule meaning不明
- Official source ambiguity
- Destructive migration
- Permission scope変更

報告状態は `BLOCKED_SPEC` とする。

## 10. PR Rule

原則は `1 PR = 1 purpose`。

例えば、次を同じPRへ混ぜない。

- DRAW Production Shadow
- Minimal CI
- Rule Source Watcher
- Incremental Importer

## 11. 次工程順

Rule本筋:

```text
DISCARD Design (COMPLETE)
↓
DISCARD Pure Rule Core + test-only Shadow (COMPLETE)
↓
Production Shadow feasibility (DEFERRED_NO_SEMANTIC_INTENT)
↓
Test-only Shadow Validation (COMPLETE / MAIN via PR #11)
↓
TAP Design (COMPLETE / MAIN via PR #12)
↓
TAP Pure Rule Core + test-only Shadow (R8; COMPLETE / MAIN via PR #13)
↓
Behavior-preserving Legacy TAP helper extraction (R9; COMPLETE / MAIN via PR #14)
↓
TAP Production Shadow (R10; COMPLETE / MAIN via PR #15)
↓
TAP Validation (R11; validated on feature branch, COMPLETE after merge)
↓
Next Vertical Slice Selection (separate AI_DESIGN + HUMAN_GATE)
```

Parallel infrastructure tracks:

- Incremental Card Importer
- Rule Source Watcher follow-ups
- Scheduler / Notification
- Backup / Restore Policy

Parallel infrastructure tracksはRule Core本筋を不要にBlockしない。

## 12. Source of Truth

優先順位：

1. Production security / online authority
2. `PROJECT_STATE.md`
3. `IMPLEMENTATION_OPERATIONS_PLAN.md`
4. `BOUNDARY_DESIGN_DRAFT.md`
5. `REPO_MAP.md`
6. individual older specs

公式DMルール内容については、公式Evidenceを優先する。
