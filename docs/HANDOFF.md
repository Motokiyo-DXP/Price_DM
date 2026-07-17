# TCG 相場チェッカー 引き継ぎガイド

この文書は、別のGitHubアカウントへ開発を引き継ぐ場合と、複数人で分担する場合の共通手順です。

## 推奨する共同開発の形

最初は所有権を移さず、次の分担にします。

| 対象 | 管理者 | 共同開発者 |
| --- | --- | --- |
| GitHub | 設定・マージ | ブランチ作成・実装・Pull Request |
| Vercel | 本番設定・環境変数 | GitHub経由で変更を提出 |
| Supabase | 本番DB・権限・PIN | SQLマイグレーションをPull Requestで提出 |

これなら、共同開発者へ本番DBの管理権限や秘密情報を渡さずに分担できます。

## 共同開発者を追加する

### 1. GitHub

リポジトリ `Motokiyo-DXP/dm-price-tracker` で次を行います。

1. `Settings` を開く
2. `Collaborators` または `Collaborators and teams` を開く
3. `Add people` から友人のGitHubユーザー名を招待する
4. 友人が招待を承認する

共同開発者は、承認後に次のURLからCloneできます。

```text
https://github.com/Motokiyo-DXP/dm-price-tracker.git
```

### 2. Vercel

通常のコード修正では、共同開発者をVercelへ追加する必要はありません。GitHubのPull Requestを管理者が確認して`main`へ反映すると、既存のVercel連携から公開されます。

公開設定や障害調査も共同で行う段階になったら、Vercelのチームへ招待します。ただし、プランによって共同利用の料金・制約が変わるため、招待画面で費用を確認してから追加してください。

### 3. Supabase

通常は管理者だけが本番Supabaseを操作します。共同開発者がDB変更を作る場合は、`supabase/migrations`へ新しいSQLファイルを追加し、Pull Requestで管理者へ渡します。

本番DBを直接共同管理する必要が出た場合だけ、Supabase OrganizationのTeam設定から招待してください。最初からOwner権限を与えず、必要最小限の権限にします。

## 共同開発者の初回セットアップ

1. リポジトリをCloneする
2. Node.js LTSを用意する
3. `npm install`を実行する
4. `.env.example`を`.env.local`としてコピーする
5. 管理者からSupabaseのURLとPublishable keyを安全な経路で受け取り、`.env.local`へ設定する
6. `npm run dev`で起動する
7. 作業前に新しいブランチを作る

```bash
npm install
npm run dev
```

`.env.local`、DBパスワード、Service Role key、登録PIN、セッショントークンはGitHubへ追加しません。

## 完全に別アカウントへ移管する場合

共同開発ではなく所有者そのものを変える場合は、次の順番で移管します。

1. GitHubリポジトリを新しい所有者またはOrganizationへTransferする
2. 新しいGitHub URLに合わせて各PCの`origin`を更新する
3. Vercelプロジェクトを新しいVercel TeamへTransferする
4. VercelのGit連携、環境変数、公開URLを確認する
5. Supabaseプロジェクトを新しいOrganizationへTransferする
6. SupabaseのTeam権限、GitHub連携、課金設定を確認する
7. 本番サイトで閲覧・検索・価格登録を再テストする

移管中もGitHub、Vercel、Supabaseで同じメールアドレスを共有したり、アカウントのパスワードを渡したりしないでください。各サービスの招待・Transfer機能を使います。

## 本番情報

- 公開URL: <https://dm-price-tracker.vercel.app>
- GitHub: `Motokiyo-DXP/dm-price-tracker`
- Supabase project ref: `fxhlobydispnbywxhirn`
- 本番ブランチ: `main`

URLやproject refは秘密情報ではありませんが、Publishable key以外の鍵やDBパスワードは文書へ記載しません。

## 引き継ぎ時の確認表

- [ ] GitHubの招待を承認できた
- [ ] 共同開発者がCloneできた
- [ ] `.env.local`がGit管理されていない
- [ ] `npm run typecheck`が成功した
- [ ] `npm run build`が成功した
- [ ] Pull Request経由で変更を確認できた
- [ ] Vercelの公開URLが正常に開く
- [ ] Supabaseの本番権限を必要以上に共有していない

