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
