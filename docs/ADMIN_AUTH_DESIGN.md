# 店舗候補管理画面: 管理者認証・認可設計

ステータス: 実装前の設計案。Supabase Auth と本番データベースの設定には管理者承認が必要です。

## 目的

`shop_candidates` の閲覧、承認、却下を管理画面から行えるようにする。投稿者用 PIN
セッションは価格登録と店舗候補の申請だけに使い、管理操作の認証には使用しない。

## 採用する境界

1. 管理者は既存 Supabase プロジェクトの Auth ユーザーとして、メールの Magic Link で
   ログインする。
2. ログイン画面では `shouldCreateUser: false` を指定し、未登録メールアドレスから Auth
   ユーザーを自動作成しない。
3. `private.admin_users` に登録された Auth ユーザーだけを管理者として扱う。メールアドレス
   や許可リストをソースコードへ書かない。
4. `shop_candidates` は引き続き公開 API ロールから読めない。管理者向けの一覧・操作は、
   管理者判定を内部で行う専用 RPC だけを経由する。
5. サービスロール鍵、管理者共有 PIN、投稿者 PIN は使わず、ブラウザへも公開しない。

これにより、管理画面の URL を知っていること、投稿者 PIN を知っていること、または
通常の Auth ユーザーであることのいずれも、候補の閲覧・承認権限にはならない。

## Next.js 構成

- `/admin/login`: Magic Link を要求する公開ページ。結果は、メールアドレスの存在を示さない
  一般的なメッセージにする。
- `/auth/callback`: PKCE の認可コードをサーバー側でセッションへ交換し、`/admin` へ戻す。
  遷移先は常に相対パスで固定する。
- `/admin`: Server Component とする。検証済みの Auth クレームがなければ `/admin/login` へ
  リダイレクトする。
- `/admin` 用の Server Action: 承認・却下時に、リクエストごとに生成した SSR Supabase
  クライアントから専用 RPC を呼ぶ。Action 側でも Auth クレームを確認する。
- `middleware.ts`: Auth セッションを Cookie で更新する。これは利便性のための補助であり、
  認可の唯一の境界にはしない。

Auth Cookie を扱うクライアントは `@supabase/ssr` の `createServerClient` でリクエストごとに
生成する。モジュール共有のクライアントや `getSession()` の戻り値だけで管理者を判定しない。
ページと Server Action では `getClaims()` で JWT を検証する。

## 新規マイグレーションの設計

既存の適用済みマイグレーションは編集しない。新規マイグレーションで次を追加する。

### 非公開の管理者名簿

`private.admin_users` を作成する。

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `created_at timestamptz not null default now()`

テーブルは Data API の公開スキーマに置かず、`anon`、`authenticated`、`service_role` への
直接権限を付与しない。RLS も有効にする。管理者判定は、`auth.uid()` とこの表を照合する
非公開関数内だけで行う。

### 候補のレビュー監査情報

`public.shop_candidates` に次を追加する。

- `reviewed_by uuid`（レビューした管理者の監査 ID。Auth ユーザー削除後も保持）

承認・却下のいずれも、操作した管理者の Auth ユーザー ID を記録する。既存の
`reviewed_at`、`review_note`、`approved_shop_id` は維持する。

### 管理操作 RPC

非公開スキーマに、`auth.uid()` が `private.admin_users` に存在することを最初に検査する
`SECURITY DEFINER` 関数を置く。すべて `search_path = ''` とし、スキーマ名を明示する。
関数は次を提供する。

- 保留中候補のページ単位一覧
- 候補の承認
- 候補の却下

これらは候補行をロックし、`pending` 以外なら競合結果を返す。承認は既存の
`private.approve_shop_candidate` と同じ「既存店舗を再利用、なければ店舗を作成」の動作を
保つ。新しい公開関数は `SECURITY INVOKER` の薄いラッパーに限定し、`authenticated` にだけ
実行権限を付与する。ラッパーから呼ばれる非公開関数も、管理者判定に失敗した時点で
例外または権限エラーにする。

`public` に管理者判定なしの `SECURITY DEFINER` 関数を作らない。`shop_candidates` の
テーブル権限や RLS ポリシーを公開ロール向けに緩めない。

## 初回設定に必要な管理者作業

実装を本番で有効化する前に、管理者が既存 Supabase プロジェクトで次を行う。

1. 管理者本人の Auth ユーザーを作成または招待する。
2. Auth の Redirect URL に、本番の
   `https://dm-price-tracker.vercel.app/auth/callback` と、必要なローカル開発用 URL を
   正確に登録する。恒久的な広い Preview ワイルドカードは登録しない。
3. 新規マイグレーションをレビュー後に適用する。
4. Auth ユーザー ID を `private.admin_users` へ登録する。メールアドレス、PIN、トークン、
   サービスロール鍵は SQL・コード・チャットへ記載しない。

この作業は Auth と本番 DB の状態を変更するため、実施前に明示承認を受ける。

## 検証計画

- 未認証ユーザーは `/admin` の一覧を取得できず、ログインへ誘導される。
- Auth ユーザーでも管理者名簿にない場合は、一覧・承認・却下の全てが拒否される。
- 管理者は pending 候補だけを閲覧でき、承認時は `shops` とレビュー情報が整合する。
- 同一候補を二重承認または承認・却下競合した場合、片方だけが成功し、もう一方は
  既レビューとして扱われる。
- 公開 API ロールで `shop_candidates`、管理用 RPC、既存の非公開関数へ不正アクセスできない。
- Supabase Security Advisor、権限照会、型生成、`npm run typecheck`、`npm run build`、
  `npm run test:import:dm` を確認する。
