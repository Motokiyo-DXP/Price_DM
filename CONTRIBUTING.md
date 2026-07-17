# 共同開発ルール

## 基本方針

- `main`は常に公開可能な状態に保つ
- 作業は機能ごとのブランチで行う
- `main`へ直接Pushせず、Pull Requestで確認する
- 一つのPull Requestへ無関係な変更を混ぜない

## ブランチ名

```text
feature/card-detail
feature/shop-master
fix/price-input
db/market-summary
docs/handoff
```

## 作業開始

```bash
git switch main
git pull
git switch -c feature/機能名
npm install
```

## 提出前の確認

```bash
npm run typecheck
npm run build
npm run test:import:dm
```

変更箇所に関係する確認だけでなく、少なくとも型チェックと本番ビルドは毎回実行します。

## Supabase変更

- 既存の適用済みマイグレーションは編集しない
- DB変更は新しい`supabase/migrations/*.sql`として追加する
- 公開スキーマのテーブルにはRLSを設定する
- 公開ビューは`security_invoker = true`にする
- `anon`と`authenticated`へ必要最小限の権限だけを付与する
- 適用前にPull RequestでSQLを確認する
- 本番適用後はSecurity Advisorとテストクエリを確認する

## 秘密情報

次の値はCommit、Issue、Pull Request、スクリーンショットへ含めません。

- `.env.local`
- Supabase Service Role key
- DBパスワード
- Supabase Management API token
- 登録PIN
- PINセッショントークン
- Vercelのアクセストークン

ブラウザ用のSupabase Publishable keyは公開利用を前提としていますが、リポジトリには実値を置かず、VercelのEnvironment Variablesと各自の`.env.local`で管理します。

## Pull Requestの分担

- 作成者: 実装、テスト結果、DB影響を説明する
- 確認者: 仕様、セキュリティ、画面、ビルドを確認する
- 管理者: `main`へ反映し、VercelとSupabaseの本番状態を確認する

