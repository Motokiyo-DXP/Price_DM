# 家庭PCへの開発環境引継ぎ

最終更新: 2026-07-23

この手順では、既存のGitHub・Supabase・Vercelプロジェクトを家庭PCから継続利用します。新しいプロジェクトは作成しません。

## 1. 必要なツールを確認する

PowerShellで次を実行します。

```powershell
git --version
node --version
npm --version
gh --version
```

GitHub Desktopを使う場合は、スタートメニューから起動できることも確認します。Node.jsはLTS版を使用します。

## 2. GitHubへログインしてCloneする

```powershell
gh auth status
gh auth login
git clone https://github.com/Motokiyo-DXP/Price_DM.git
cd Price_DM
git remote rename origin price-dm
git config remote.pushDefault price-dm
git branch --set-upstream-to=price-dm/main main
```

These commands are for a new standalone Price_DM clone. Do not rename remotes in a shared multi-worktree Git directory; use the existing explicit `price-dm` remote there.

既存の共有GitHubアカウントを使用します。アクセストークンやワンタイムコードをチャット・スクリーンショット・GitHubへ記録しません。

## 3. 作業前に読む文書

- [README.md](../README.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [HANDOFF.md](HANDOFF.md)
- [PROJECT_STATUS.md](PROJECT_STATUS.md)
- [HOME_PC_HANDOFF.md](HOME_PC_HANDOFF.md)
- [AI_CONTINUATION_PROMPT.md](AI_CONTINUATION_PROMPT.md)
- [HANDOFF_SNAPSHOT_2026-07-18.md](HANDOFF_SNAPSHOT_2026-07-18.md)
- [SHOP_APPROVAL.md](SHOP_APPROVAL.md)

ファイル名に日付が含まれるスナップショットも、2026-07-23時点の状況へ更新しています。

## 4. ローカル環境を設定する

`.env.example`を参考に`.env.local`を作り、既存Supabaseプロジェクトの公開接続情報だけを設定します。`.env.local`、PIN、秘密鍵、DBパスワード、Service Role key、アクセストークンはGitへ追加しません。

```powershell
npm ci
npm run typecheck
npm run build
npm run test:import:dm
```

デュエル・マスターズ公式データの全件取得コマンドは、再利用条件が確認されるまで実行しません。

## 5. 作業開始前にGitを確認する

```powershell
git status --short --branch
git remote -v
git fetch price-dm --prune
git log -1 --oneline
git rev-list --left-right --count main...price-dm/main
```

`main`へ直接変更せず、最新の`main`から`motokiyo`を含む機能ブランチを作ります。

```powershell
git switch main
git pull --ff-only price-dm main
git switch -c motokiyo/<作業名>
```

## 6. Supabase・Vercelの扱い

- GitHub: `Motokiyo-DXP/Price_DM`
- 本番ブランチ: `main`

`price-dm` がPrice_DMのremoteです。`origin`は別リポジトリを指し得るため、Price_DMでは使用しません。適用済みマイグレーションは編集しません。DB変更は新しいマイグレーションとして追加し、ローカル検査・差分確認・Pull Requestを経て専用release sessionで適用します。VercelとSupabaseの新規プロジェクトは作成しません。

## 7. 引継ぎ完了チェック

- [ ] 必要なツールとGitHubログインを確認した
- [ ] 正しい既存リポジトリをCloneした
- [ ] 必須文書をすべて読んだ
- [ ] 秘密情報がGit管理外であることを確認した
- [ ] `npm ci`と指定された検査が成功した
- [ ] `main`と`price-dm/main`が同期している
- [ ] `motokiyo`を含む機能ブランチで作業している

