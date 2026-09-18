# Supabase migrations

このフォルダの適用済みバージョン番号は、本番Supabaseの
`supabase_migrations.schema_migrations` と一致させています。

`20260717061934_set_registration_pin.sql` は、履歴上の名前を保ちながら、
PINそのものを保存しない安全な再構築用マイグレーションです。新しい環境では
READMEの管理者用手順に従い、PINを別途設定してください。

未適用の新しいマイグレーションを本番へ反映するときは、必ず次を確認します。

1. 型検査と本番ビルドが成功していること
2. Supabase Security Advisorに新しい警告がないこと
3. 既存データを削除・上書きするSQLが含まれていないこと
4. ローカルの適用済み番号と本番の履歴が一致していること

## Production release checklist

Production DB write is performed by one explicitly designated release session only. Before it starts:

1. Fetch and confirm the latest `price-dm/main`.
2. Compare production migration history with Git (Remote-only and Local-only must be understood and resolved).
3. Replay all migrations in a fresh local database.
4. Run tests, typecheck, and build, then run the guarded `db:prod:dry-run` command.
5. Confirm that only the intended migration set will run; stop immediately for any unexpected difference.
6. The committed, clean `main` checkout alone may run the guarded production write.
7. Recheck production migration history after the write.

Do not use `supabase db push --linked` directly in feature sessions. Use `npm run db:prod:dry-run -- --confirm-production` or `npm run db:prod:push -- --confirm-production` only in the release session with `PRICE_DM_PRODUCTION_RELEASE=1`. Migration repair is deliberately not scripted.
