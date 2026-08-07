# AI作業継続時の指示

最終更新: 2026-08-08

別のGPT／Codexアカウントで作業を再開するときは、この文書とリポジトリ内の最新文書を正とします。

## 固定ルール

- GitHubリポジトリは `Motokiyo-DXP/dm-price-tracker`
- Clone URLは `https://github.com/Motokiyo-DXP/dm-price-tracker.git`
- GitHub・Supabase・Vercelは既存の共有アカウントと既存プロジェクトを使う
- 新しいSupabase・Vercel・GitHubプロジェクトを作らない
- `main`へ直接変更せず、`motokiyo`を含む機能ブランチとPull Requestを使う
- 適用済みマイグレーションを編集せず、DB変更は新規マイグレーションで行う
- `.env.local`、PIN、秘密鍵、DBパスワード、Service Role key、アクセストークン、セッショントークンを出力・回答・Gitへ含めない
- デュエル・マスターズ公式データは利用許諾確認済み。許諾範囲外の項目や頻度へ拡張せず、`docs/OFFICIAL_CARD_DATA.md`を優先する
- テスト目的の架空店舗、価格記録、修正申請を本番へ作らない

## 最初に読むファイル

1. `README.md`
2. `CONTRIBUTING.md`
3. `docs/HANDOFF.md`
4. `docs/PROJECT_STATUS.md`
5. `docs/HOME_PC_HANDOFF.md`
6. `docs/AI_CONTINUATION_PROMPT.md`
7. `docs/HANDOFF_SNAPSHOT_2026-07-18.md`
8. `docs/SHOP_APPROVAL.md`

## 変更前の確認

1. 現在のブランチ、`origin`、変更状態
2. `main`と`origin/main`の同期
3. 最新コミット
4. Next.jsとSupabaseの構成
5. ローカルと本番のマイグレーション履歴
6. 実装済み機能と未実装機能
7. 次に着手すべき作業
8. 競合しそうなファイル

## 基本検査

依存関係を変更していない引継ぎ直後は、次を順に実行します。

```powershell
npm ci
npm run typecheck
npm run build
npm run test:import:dm
```

作業内容に対応する単体テストも追加で実行します。検査が完了するまでコードを本番へ反映せず、Supabase・Vercelの本番設定を変更しません。

## 現在の優先判断

運用確認が必要な項目は、実在する候補や誤記録が発生した時だけ確認します。安全に先行できる作業は、既存店舗の読み・別名整備、管理画面の操作性改善、入力検証・テスト・文書整備です。位置情報やカスタムSMTPは、利用条件・費用・認証情報の判断が必要になるまで実装を開始しません。

ホーム画面のUI刷新と、価格未登録を含む公式カード全体の検索は本番反映済みです。検索語が空の場合は価格情報のあるカードを表示し、検索語がある場合は既存の `search_canonical_cards` RPCを使います。価格未登録カードからも `/register?cardId=<ID>` へ移動でき、カードが選択済みになることを本番で確認済みです。

