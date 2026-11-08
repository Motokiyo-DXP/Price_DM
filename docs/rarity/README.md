# カード印刷版レアリティ・検索フィルター

ローカル実装・検証済み。本番未反映。全件完了ではない（未確認5件）。

## データ

2026-11-08の本番読み取りスナップショットは23,751印刷版。公式検索の実在する24区分を全ページ取得し、公式IDで照合した。重複区分・検索未掲載の509件は個別の公式詳細ページとカード番号でも照合した。画像の取得・更新はしない。

`card_prints.rarity_codes text[]`に通常レアリティを保存する。名前からの推定や番号からのSEC判定はしない。加工・封入形態はこの列に混ぜない。`NULL`は未確認、`{NONE}`は公式の「レアリティなし」。配列にしたのは、[DMEX08 7/???](https://dm.takaratomy.co.jp/card/detail/?id=dmex08-007)と[8/???](https://dm.takaratomy.co.jp/card/detail/?id=dmex08-008)の両面にU/VICが別々に明記されているため。片面の「-」は他面の明示的な区分を置き換えない。

ローカルPostgreSQL 17.11に全件の識別情報を複製し、**23,746件登録、5件未確認**を確認した。再実行・rollback・再適用でも識別情報は同一。本番への登録は0件。

- 公式ID欠落4件: print ID 48157 / 48403 / 48509 / 48543。
- 番号不一致1件: print ID 48165。DBは`DM26RP3 DM1㊙/DM1`、公式ID `dm26rp3-dm001sec`の詳細表示は`DM26RP3 DM1/DM1`。不一致を無視してDMRを登録しない。

対象行は[unverified.json](unverified.json)、検証・区分別件数・全件成果物のSHA-256は[verification.json](verification.json)。全件の照合結果・再開用キャッシュ・条件付き適用SQL・データrollback SQLはこのworktreeの`.local/rarity/`に保全している。現在のSQLをそのまま本番へ実行しない。

## 検索・UI

- 文明→文明条件→色数→コスト→パワー→タイプ→種族→テキスト→詳細の順。詳細は初期閉鎖、商品・レアリティ・番号を格納し、設定時に「条件あり」を表示する。
- レアリティはC・UC・R・VR・SRを1列に固定し、その他のDB区分は複数選択できるプルダウンに格納する。UCの検索には既存の公式コードUを使う。「その他」は閉じても選択件数を表示する。選択区分同士はOR、他条件とはAND。商品・番号・レアリティは同じ印刷版上で一致させる。未指定なら未確認版も対象。
- 全条件を自動適用。既存debounce・AbortController・応答世代チェック・ページング・並べ替えを維持。商品・種族の下位選択画面も選択時に反映する。
- 上部×・確定操作・コストなしチェックを廃止。固定フッターは左「条件クリア」、右「閉じる」。クリアは開いたまま。入力領域だけスクロールし、VisualViewportのresize/scrollとセーフエリアに追従する。
- 両コスト端未指定時だけNULLコストを含む。0は数値として扱い、無限コストの従来仕様は維持。旧`p_no_cost`引数は互換性のため受理するが、範囲指定を回避させない。旧RPCと新しい必須`p_rarities`引数を持つRPCをPostgRESTで検証した。
- 今後の標準公式取得→SQL生成も印刷版の`rarity_codes`を引き継ぐ。同名canonicalメタデータからは引き継がない。未取得値・既存確認値・手動ロックを保全する。

## 再現

通常チェック: `npm run typecheck` / `npm test` / `npm run build`。
新規DB・取込テスト: `npm run test:rarity`（CIにも追加）。

公式再照合はこの順序で実行する（全てDBへの書き込みなし）。最初のスナップショット`.local/rarity-prints-before.json`を最新の本番読み取りで用意すること。

```text
node scripts/collect-dm-rarities.mjs
node scripts/refine-dm-rarities.mjs
node scripts/build-dm-rarity-backfill.mjs
```

全ページ取得は直列・1秒間隔。キャッシュ再開対応。HTTP 403/429/5xx、取得中の件数変化、ページ重複で停止する。未確認を推定で埋めない。適用SQLはID・canonical ID・公式ID・番号・商品・ロック・既存値・全件数の変化で停止し、再実行は同一provenanceの既登録値のみ許容する。

ブラウザ検証は専用ローカルDBと合成Authを使用し、本番認証は使用しない。port 3000/55483の競合を確認してから、別ターミナルで以下を起動する。

```powershell
node scripts/rarity-browser-fixture.mjs
# 別ターミナル
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:55483'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='isolated-rarity-public-key'
npm run dev
# 別ターミナル
node scripts/check-rarity-browser.mjs
```

ネイティブ検証はこのworktree専用の`.local/rarity-native/pgdata`・127.0.0.1:55482・`rarity_local`だけを許可する。起動済みの専用PostgreSQL 17と公式PostgREST実行ファイル（WindowsではlibpqのDLLパスもPATHへ追加）を使用する。

```powershell
$env:PRICE_DM_RARITY_NATIVE_URL='postgres://rarity_local@127.0.0.1:55482/postgres'
node scripts/test-rarity-search.mjs
$env:PRICE_DM_POSTGREST_EXE='<公式PostgREST実行ファイル>'
node scripts/test-rarity-postgrest.mjs
node scripts/test-rarity-backfill-snapshot.mjs
```

## 検証範囲・本番保留

既存`npm test`は607件成功。新規レアリティテスト、実際に生成した新規カード取込SQL、PGliteとネイティブPostgreSQLでのマイグレーション適用・再実行・トランザクションrollback・検索rollback SQL、全件バックフィルとrollback、PostgRESTでの新旧RPC・匿名アクセス拒否を確認した。型チェック・ビルド成功。既存CSS警告と、環境変数なしのビルド時の既存データ取得ログは残る。

Chromiumで1280×900、390×844、320×568を実操作した。全条件の自動反映、クリア・閉じる・再開時保持、詳細の有効表示、空白区切りAND、遅延した旧応答の破棄、主要5区分の1列表示・その他19区分のプルダウン、文明1行、フッター固定、画面高420pxへの縮小を確認。画面は`.local/rarity/browser/`に保存。本物のiOS/Androidキーボード・端末、Hosted Supabase Authは未検証。

本番保留の理由は未確認5件と、元の作業ディレクトリに検索UI/CSS/IMEを含む別作業が残っていること。指定の専用統合・リリースセッションで、最新`price-dm/main`、全worktree、マイグレーション履歴、復旧可能なバックアップ、未確認データの扱いを確認する必要がある。GitHub push・リモートCI・本番DB変更・Vercel deployは実施していない。

リリースではschema→確認済みデータ→appの順に進める。マイグレーションと正確なデータpayloadを先にGitへ記録し、最新スナップショットとの差分確認後にのみ専用リリースセッションで適用する。検索機能のrollbackはappを戻してから[rollback-search.sql](rollback-search.sql)を使用し、レアリティ列・取得データは保持する。データを戻す場合は`.local/rarity/rollback-backfill.sql`を使い、変更後の値やロックがあれば停止する。これらのrollbackはローカルで検証済み。
