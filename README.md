# dm-price-tracker

TCGカードの販売価格・買取価格・在庫状況を共有する Next.js アプリです。
データは Supabase の `card_price_summary` ビューから取得し、価格登録は
短時間だけ有効な登録セッションを通して行います。登録PINやセッショントークンの
平文はデータベースへ保存しません。

## 開発への参加・引き継ぎ

- [引き継ぎガイド](docs/HANDOFF.md)
- [現在の実装状況](docs/PROJECT_STATUS.md)
- [価格修正申請の運用](docs/PRICE_CORRECTION.md)
- [共同開発ルール](CONTRIBUTING.md)

友人との共同開発では、GitHubの機能ブランチとPull Requestを使い、本番Vercel・Supabaseの管理権限は必要になるまで共有しない運用を推奨します。

## ローカル起動

1. `.env.example` を `.env.local` としてコピーし、既存 Supabase プロジェクトの
   URL と Publishable key を設定します。
2. 依存関係をインストールして開発サーバーを起動します。

```bash
npm install
npm run dev
```

`.env.local` を含む `.env.*` は `.gitignore` の対象です。公開用の
`.env.example` だけを GitHub に含めてください。

## Supabase 側の前提

- `tcg_games`、`canonical_cards`、`card_prints` に表示・検索対象のカードマスタが登録されていること
- `app_config.registration_pin_hash` に登録 PIN のハッシュが設定されていること
- 公開読み取り用 RLS と `submit_price_record` の実行権限が有効であること

カード検索では、カタカナをひらがなへ統一し、空白と中点を除いて照合します。
同名の再録カードは `canonical_cards` の1件へまとめ、収録版は `card_prints` で
区別します。価格登録で収録版を選ばなかった場合、`card_print_id` は空欄のまま
保存され、カード名単位の標準相場へ使われます。`card_search_terms` は
《理想と平和の決断》／《パーフェクト・アルカディア》のような別名・読みを保持します。

## 登録 PIN の初回設定

登録 PIN の値やbcryptハッシュは、マイグレーション、環境変数、ソースコードへ
保存しません。セキュリティマイグレーションの適用後、Supabase Dashboardの
SQL Editorで管理者が次のSQLを一度だけ実行してください。

`<SHARED_PIN>` はSQL Editor上でのみ実際のPINへ置き換え、置換後のSQLを
リポジトリ内のファイルやGitHubへ保存しないでください。このSQLはハッシュが
未設定の場合だけ更新するため、設定済みの値は上書きしません。

```sql
update public.app_config
set registration_pin_hash = extensions.crypt(
      '<SHARED_PIN>',
      extensions.gen_salt('bf', 12)
    ),
    updated_at = pg_catalog.now()
where id = true
  and registration_pin_hash is null
returning id, registration_pin_hash is not null as configured;
```

`configured` が `true` の1行を返せば設定完了です。0行の場合は既に設定済みです。
確認時もハッシュ本体は取得せず、次のSQLで設定有無だけを確認してください。

```sql
select registration_pin_hash is not null as configured
from public.app_config
where id = true;
```

## デュエル・マスターズ公式カードの試験取得

本番データを登録する前に、公式カード検索から最新20件のカード名・収録番号・
商品名・公式URLだけを確認できます。画像、カード本文、価格は取得しません。
公式サイトへのアクセスは1件ずつ1秒間隔で行い、robots.txtで許可されている
ことを先に確認します。

```bash
npm run import:dm:sample
```

確認結果はGit管理されない `.local/dm-cards-sample.json` に保存されます。
この試験ではSupabaseへ書き込みません。

## デュエル・マスターズ公式カードの全件取得

公開サービスへ全件データを投入する前に、データ提供元から再利用の許可を得てください。
公開APIやCSV配布が確認できていないため、現在は取得・検証処理の開発だけを行い、
本番データベースへの一括投入は保留します。

全件取得も画像・カード本文・価格を対象外とし、カード名、通常の読み、確認済みの
別名、収録番号、商品名、公式URLだけを保存します。1件ずつ1秒間隔で確認するため
数時間かかりますが、進捗は `.local/dm-cards-full-checkpoint.json` に保存され、同じ
コマンドを再実行すれば続きから再開できます。

```bash
npm run import:dm:full
```

取得結果はGit管理されない `.local/dm-cards-full.jsonl` に保存されます。この工程も
Supabaseへ直接書き込みません。全件取得完了後に内容と件数を検証し、管理者権限で
分割投入します。

特殊な公式読みは、最初に相談されたDECK MAKERの公開カード検索を補助データとして
使い、カード名と特殊ルビだけを取得します。公開検索用の認証情報は保存せず、その
時点のWebアプリから毎回検出します。

```bash
npm run import:dm:aliases
npm run build:dm:import
```

後者は公式一覧の取得完了を確認してから、100件単位の検証用SQLを `.local` に生成
します。生成物はGitHubへ含めません。

## 登録PINの保持

正しいPINを確認すると、ランダムな認証情報へ交換して `HttpOnly` Cookieに保存し、
同じ端末では14日間PIN入力を省略します。CookieからPINを復元することはできません。
認証情報はブラウザのJavaScriptから読み取れず、登録画面から手動で解除できます。
