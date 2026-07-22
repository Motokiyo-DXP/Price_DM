# 引継ぎスナップショット

作成日: 2026-07-18  
最終更新: 2026-07-23

ファイル名は初回引継ぎ日を保持しています。実装状況はこの最終更新日時点の内容です。詳細は[PROJECT_STATUS.md](PROJECT_STATUS.md)を参照してください。

## 接続先

- GitHub: `Motokiyo-DXP/dm-price-tracker`
- 本番ブランチ: `main`
- Vercel: <https://dm-price-tracker.vercel.app>
- Supabase project ref: `fxhlobydispnbywxhirn`

接続先識別子は秘密情報ではありません。鍵、PIN、パスワード、トークンはこの文書へ記載しません。

## 構成

- Next.js App Router / TypeScript
- Supabase Postgres / Auth / RPC
- VercelのGitHub連携によるPreview・本番デプロイ
- 公開相場画面、カード詳細、価格登録、管理者画面
- 登録PINの14日セッションと管理者Magic Link認証

## 実装済みの主要機能

- 同名カードをまとめた相場一覧とカード詳細
- 販売・買取価格、在庫、注意属性、日次平均推移
- 日本語表記差を許容するカード・店舗検索
- 承認済み店舗の選択と未登録店舗候補の申請
- 管理者による候補承認・却下、店舗直接登録
- 既存店舗の読み・別名編集と対象店舗の絞り込み
- 価格修正申請と管理者レビュー、監査情報の保持
- 公開DB権限の最小化と入力・DB応答の実行時検証

## 直近のDB変更

次のマイグレーションまで本番適用済みです。

```text
20260720060236_add_admin_direct_shop_registration.sql
20260720164042_tolerant_shop_search.sql
20260722141114_shop_search_nfkc_folding.sql
20260722143706_admin_shop_search_metadata.sql
```

これらを含む適用済みファイルは編集しません。追加変更は新しいタイムスタンプのマイグレーションで行います。

## 未完了・運用待ち

- 実在する店舗候補が発生した時の申請・承認・却下の一連確認
- 実在する価格誤記録が発生した時の修正申請・レビュー確認
- 確認済み店舗の読み・別名の継続整備
- 利用条件と費用を確認した後の位置情報・距離検索検討
- 費用と送信元ドメインを確認した後のカスタムSMTP判断

公式カード全件取得は再利用条件の確認まで保留です。トレカの地図をシステムへ恒久的に組み込まず、店舗情報は公式サイトや店舗SNS等で実在を確認した範囲で手動登録します。

## 再開時の最初の操作

```powershell
git status --short --branch
git remote -v
git fetch origin --prune
git log -1 --oneline
npm ci
npm run typecheck
npm run build
npm run test:import:dm
```

検査後、最新`main`から`motokiyo`を含む機能ブランチを作成します。

