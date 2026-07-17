# dm-price-tracker

TCGカードの販売価格・買取価格・在庫状況を共有する Next.js アプリです。
データは Supabase の `card_price_summary` ビューから取得し、価格登録は
`submit_price_record` RPC を通して行います。

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

- `tcg_games` と `cards` に表示・検索対象のカードマスタが登録されていること
- `app_config.registration_pin_hash` に登録 PIN のハッシュが設定されていること
- 公開読み取り用 RLS と `submit_price_record` の実行権限が有効であること

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
