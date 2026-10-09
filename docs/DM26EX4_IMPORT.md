# DM26-EX4 暫定登録

添付 `dm26ex4-import-package.zip` の48収録版だけを対象とする。全収録一覧ではない。

- 商品名・商品コード・2026-10-17発売日は公式商品ページで確認。
  https://dm.takaratomy.co.jp/product/dm26ex4/
- カード名・番号はDMwiki由来の非公式・未検証情報。
  https://m.dmwiki.net/DM26-EX4
- `scripts/dm26ex4-preview.json` にソースURLと `verified=false` を保持する。
  公式カード検索の商品選択肢にDM26-EX4がないこと、48件の名前と番号がwikiに一致することを2026-10-09に確認。
- 暫定収録版の `official_card_id`, `official_url`, `source_checked_at` はNULL。
  検索語は `source=dmwiki`, `verified=false`。ルビ断片は `alias_reading` にのみ保存する。
- 新規カード名のコスト・読み・文明・種族・テキスト・パワー・画像を推測しない。
  既存カード・商品・画像・手動編集・検索語は更新しない。
- 6件のシークレット版と1件の両面カードは `deferred_review` に保持し、登録しない。

## 生成と検証

```powershell
node scripts/build-dm26ex4-dry-run.mjs
node scripts/build-dm26ex4-preview.mjs scripts/dm26ex4-preview.json .local/dm26ex4-preview-import.sql
node --test scripts/dm26ex4-import.test.mjs
npm run test:import:dm
npm run test:db-safety
npm run typecheck
```

dry-run SQLはSELECTのみ。本番でロールバック付きINSERTを実行せず、シーケンスも消費しない。
2026-10-09の本番読み取り照合: 商品追加1、カード名追加46、既存カード名再利用2、収録版追加48、
非公式検索語追加49、更新0、収録版重複0、保留7、競合0。

隔離したローカルPostgreSQLで現行カードテーブル定義と本番の再利用対象2件・検索語13件を使い検証した。
初回追加件数はdry-runと一致。2回目はすべて追加0。再利用カード・読み・既存検索語は完全一致。
正式IDへの更新で収録版IDとカードIDが保持される。収録版ロック、カードロック、名前相違、
他収録版の公式ID衝突、削除済み収録版、商品リンク欠損の6条件で照合を拒否。
既存商品名の手動編集も拒否。関連テストは7+73+8件成功、型チェック成功。

ZIPからの修正: schema修飾されたPostgreSQL `normalize` の第2引数を文字列 `'NFKC'` に変更。
商品upsertを更新なしに変更し、相違・未リンク版・削除・曖昧なカード名・既存重複の停止条件を追加。
照合はDM26-EX4の公式IDのみ受け付け、手動ロックしたカードも停止する。

## 専用リリース工程

本番書き込みは検証済みソースをGitに記録・GitHubに反映した後のみ。
専用リリースcheckoutで既存 `assertProductionDbRelease` を使い、
`PRICE_DM_PRODUCTION_RELEASE=1`、clean main、`HEAD=price-dm/main`、Price_DM remoteを確認する。
本番の接続先はPrice_DMの `.env.local` のURLと照合し、別プロジェクトには適用しない。
最新main、他worktreeの未反映DB変更、他セッション、migration履歴、dry-runを直前に再確認する。
競合や履歴変化は停止。スキーマ変更は不要で、他機能のmigrationをまとめて適用しない。
既存のSQLデータimportと同様に、生成SQLを一つのトランザクションで適用する。
5秒のlock timeoutとテーブルロックにより競合中は適用しない。
前後の既存全カードテーブル行のchecksumと件数差、未検証フラグ、外部キー、再実行dry-runを確認する。

## 公式データ公開後

2026-10-10の詳細情報補完後は、以下の旧手順ではなく
`DM26EX4_COMPLETION_RELEASE.md` の `build-dm26ex4-official-update.mjs` による
項目別の出典所有・取得状態を確認した更新を使う。既存の暫定収録版を
汎用の上書きimportへ渡さない。既存IDと手動編集を保護し、未取得項目を消去しない。

既存クローラの正式カードJSONLを用い、正式importの**前**に次を生成する。

```powershell
node scripts/build-dm26ex4-reconciliation.mjs .local/dm-cards-full.jsonl .local/dm26ex4-reconciliation.sql
```

商品・番号・NFKC名一致の暫定収録版へ公式IDとURLを付け、IDを維持する。
その後 `build-dm-card-import.mjs` の既存正式importを実行する。
番号・名前が異なる、公式IDが別収録版に存在する、削除済み、手動ロック、未リンク、重複は自動統合せず停止する。
公式importの対象フィールドと手動編集・読みの保持を改めて検証すること。
DMwiki検索語を公式へ昇格しない。画像同期も既存の別工程で実施する。
