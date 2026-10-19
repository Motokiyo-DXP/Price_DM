# 買い物リスト共有・画像拡大 リリース事前確認

> 10/17時点の履歴です。10/19の追加検証・セッション失効修正は `shopping-sharing-release-20261019.md` を参照。

- ユーザーは他のPrice_DMセッションの本番DB変更・main統合・本番デプロイを停止済みと明示し、このチャットを唯一のリリース担当に指定した。排他のユーザー確認は充足。
- 全セッションを技術的にロックする共通機構は確認できない。重要な外部書込みの直前にmain、PR、本番migration履歴、進行中の本番変更を再確認する。
- 最新 `price-dm/main`: `90f3e259b0c1015497036b320280bcdff952f7fd`。
- 新しいリリース用worktreeはこのSHAから作成。元の実装worktreeと正本の未コミット変更は保持。ホームの収録日順ソート変更は含まない。
- 本番migrationは177件、最新 `20261011031543`。`20261016181706` は未適用。読み取り専用で確認。
- 公開中PR #3・#17は無関係なドキュメント変更。今回のPRは未作成。
- Vercel: `dm-price-tracker`、Hobby、Fluid Compute有効、リージョンhnd1、Git接続のProduction branchはmain。本番SHAは上記mainと一致。
- [Vercel公式の制限](https://vercel.com/docs/functions/limitations)ではFluid ComputeのHobby上限は300秒。今回のコード上のmaxDuration=60秒は範囲内。ただし実配信時の終了・再接続・負荷は未検証。

## 再検証

- 最新mainを基点とする本worktreeで、関連108件、ブラウザーテスト6件、CI関連209件（rule 38、rule-source 9、playfield 162）が成功。
- 型チェック、ビルド、git diff --checkは成功。既存CSS警告と、本番接続情報を読み込まないビルド時のSupabase未設定ログあり。
- ブラウザーテストは従来の隔離PostgreSQLと通信アダプターを使用。実クラウドSupabase検証の代替とは扱わない。

## クラウド検証環境の準備待ち

- 作成可能な組織一覧は `Motokiyo-DXP's Org` (`munpaiktwenxwdonielw`)、現プランfree。
- Supabaseツールはプロジェクト作成先組織をユーザーに確認することを必須としている。組織選択の質問を送信済み、回答待ち。
- 組織の確定後に追加プロジェクト費用を見積もる。組織がfreeであることだけでは追加プロジェクト費用を0と断定しない。有料操作は事前報告・費用への同意前に実施しない。
- クラウドプロジェクト、テストアカウント、PRは未作成。push・本番DB変更・main統合・デプロイは未実施。
- 今後の必須項目は全migrationの実適用、実Auth/RLS/RPC、SSE負荷・切断・解除・ログアウト・セッション失効、実カード画像での画面確認、Previewと本番の配信検証。
