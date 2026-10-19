# 画像拡大・買い物リスト共有 リリース検証

## 範囲と排他

- 対象は画像拡大、価格未登録カードの詳細、買い物リストのフレンド・URL共有、SSE通知、`20261016181706_shopping_list_sharing.sql`。ホームの収録日順ソート変更は含めない。
- ユーザーは他セッションの本番DB変更・main統合・本番デプロイの停止を明示し、このチャットを唯一の担当に指定した。共通の技術的な排他ロックはないため、重要な書込み直前にmain・PR・migration履歴・競合を再確認する。
- 作業基点は `price-dm/main` の `90f3e259b0c1015497036b320280bcdff952f7fd`。正本および元の実装worktreeの未コミット変更は保持。

## 隔離した実Supabase

- プロジェクト: `price-dm-shopping-validation-20261019` (`xzemsybkumpafdxefzxp`)、東京リージョン。
- 指定組織は `Motokiyo-DXP's Org`。作成前の追加プロジェクト見積りは月額 **$0**。
- 本番の認証情報や個人データは複製していない。3つのテストアカウント、カード3件、店舗2件、価格を新規作成。
- 全178 migrationを番号順に適用し、履歴を照合。初回のRealtime基盤テーブル未生成は、標準Realtimeへの接続による初期化で解消した。既存migrationは変更していない。
- 今回のmigrationをテストデータ存在下でリハーサルし、canonical_cards、card_prints、price_records、decks、deck_cards、account_card_bookmarks、user_friendships、profilesの前後ハッシュが一致した。隔離DBだけで機能所有オブジェクトを再作成したもので、本番履歴のrepairは行っていない。

## 実環境で発見・修正した権限問題

ログアウト後も有効期限内のJWTでフレンド共有を読めることを再現した。`auth.uid()`だけでなく、信頼されたJWTのsession_idと`auth.sessions`の有効な行を照合するprivate関数を追加し、共有読取・設定変更を検証するようにした。匿名URLの閲覧は引き続き有効トークンだけで可能。

修正後は失効済みJWTでの読取・設定変更が42501で拒否された。クライアント側もSIGNED_OUTでストリームと表示を閉じる。期限切れセッション・削除済みセッションの回帰テストを追加した。

## テスト結果

- 関連テスト109件（従来108件に失効セッションの1件を追加）、CI関連209件が成功。
- 従来の通信アダプターを使うブラウザー6件が成功。実Supabase検証の代替には扱っていない。
- 実Supabaseを使うブラウザー/APIテスト5件が成功。所有者・許可フレンド・非許可ユーザー・匿名、共有URLの発行/失効/再発行、他人の変更拒否、既存のフレンドRPC・非公開デッキ作成/権限も確認。
- 独立したChromiumプロセス2つで追加・削除・全件解除、通信断/復帰、共有解除、URL停止、ログアウトを確認。
- PC 1280×900、スマートフォン幅390×844で公式の実カード画像（384×275と384×536）、90度補正、代替表示、モーダル開閉・フォーカス、検索と登録入力の保持、価格未登録詳細、デッキ編集画面への認証済みアクセスを確認。物理スマートフォン実機の検証ではない。
- 型チェック、ビルド、git diff --checkが成功。既存CSS警告および本番接続情報を入れないビルド時のフォールバックログは残る。
- 実クラウドテストは `SHOPPING_CLOUD_STATE=<隔離環境のローカル状態ファイル> npm run test:shopping-cloud` で実行する。状態・認証情報・トレースは `.local/` に置き、Gitや公開artifactへ送らない。

## SSEの実測

ローカルNext.jsから実Supabaseへ接続し、PostgreSQLのpg_stat_statementsで測定。初回の画像・価格取得を含む。

| 同時接続 | 接続時間 | 権限確認RPC | Data API全体 | SQL実行時間合計 | 切断後の追加問い合わせ |
| --- | --- | --- | --- | --- | --- |
| 1 | 10.6秒 | 11 | 15 | 13ms | 0 |
| 5 | 10.4秒 | 55 | 75 | 36ms | 0 |
| 20 | 10.7秒 | 220 | 300 | 99ms | 0 |

自然終了は50.03秒。VercelはHobby、Fluid Compute有効、hnd1。コードのmaxDurationは60秒で、[Hobbyの300秒上限](https://vercel.com/docs/functions/limitations)内。これは20接続までの短時間測定で、無制限の同時接続や長期負荷の保証ではない。Vercel Previewでの実配信・終了・再接続は次のリリースゲートとして確認する。

## セキュリティ診断

ERRORはなし。新規private共有テーブルの「RLS有効・ポリシーなし」は意図した全面拒否で、anon/authenticatedの直接権限も取り消している。認可したprivateのSECURITY DEFINER実装のみが読む。公開RPCはSECURITY INVOKER。

既存の対戦・デッキ・価格登録などの公開SECURITY DEFINER関数へのWARNと、検証プロジェクト既定の漏洩パスワード検査無効WARNは今回の機能外で変更していない。[RLS診断説明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[公開definer診断説明](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)。

## リリース順序と復旧

1. アプリを含む候補PRを作成し、隔離Supabaseを参照するブランチ限定Previewで検証する。
2. 既存のDBガードは最新main上のコミット済みmigrationを要求するため、migrationだけのPRを先に統合する。旧アプリの自動デプロイはこの追加DDLと互換性がある。
3. 最新mainのクリーンな専用チェックアウトで、指定本番プロジェクト・履歴・排他を再確認し、厳密なdry-runで今回の1件だけが対象であることを確認して適用する。
4. アプリPRを最新mainと整合させ、CI/Preview確認後に統合し、ProductionのSHA・alias・機能を確認する。
5. アプリに重大な問題があれば新規変更を止め、直前の正常なVercel deploymentへ戻す。追加された共有テーブル/RPCは旧アプリに影響しないため、DBの破壊的ロールバックや履歴repairは独断で行わない。

この記録作成時点では本番DBの履歴は177件、今回のmigrationは未適用。本番結果はリリース完了報告に記す。
