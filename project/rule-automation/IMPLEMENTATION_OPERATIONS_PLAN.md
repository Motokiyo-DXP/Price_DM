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

- R0 Rebaseline: 今回
- R1 Stage 4.5 DRAW Production Shadow: **NEXT**
- R2 DRAW Shadow Validation
- R3 Next Vertical Slice Selection: `AI_DESIGN + HUMAN_GATE`

Stage 4.5ではLegacy結果のみをProduction authorityとして利用する。Rule Core結果は比較専用とする。

### Track C — CI

Near-term。

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

Rule Engine用に将来、`npm run test:rule` のような安定entry pointを用意する。ただし今回のPRではCIを実装しない。

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

現在の `source_manifest.yaml` を将来的に実行可能なWatcherへ発展させる。

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

1. STEP 1 Rebaseline — 今回
2. STEP 2 Stage 4.5 DRAW Production Shadow
3. STEP 3 Minimal CI
4. STEP 4 DRAW Shadow Validation
5. STEP 5 Rule Source Watcher
6. STEP 6 Next Rule Vertical Slice Selection
7. STEP 7 Incremental Card Importer
8. STEP 8 Scheduler / Notification
9. STEP 9 Backup / Restore Policy

STEP 2が本筋。STEP 3以降のインフラ整備によってSTEP 2を不必要にBlockしない。

## 12. Source of Truth

優先順位：

1. Production security / online authority
2. `PROJECT_STATE.md`
3. `IMPLEMENTATION_OPERATIONS_PLAN.md`
4. `BOUNDARY_DESIGN_DRAFT.md`
5. `REPO_MAP.md`
6. individual older specs

公式DMルール内容については、公式Evidenceを優先する。
