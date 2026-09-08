# ローカルプレビューの起動方法

このプロジェクトでは、Vercelへ反映する前の確認にNext.jsの開発サーバーを使用します。
PC内からは `http://localhost:3001`、同じWi-Fi内の端末からは
`http://<PCのIPv4アドレス>:3001` でアクセスできます。

## 初回だけ行う準備

1. Node.js 22以上をインストールする。
2. リポジトリのルートで依存関係をインストールする。

```powershell
npm install
```

3. `.env.local` にSupabaseとカード画像配信先を設定する。
   `.env.local` は認証情報を含むためGitには保存しません。

## 起動

リポジトリのルートで次を実行します。

```powershell
npm run preview:local
```

このコマンドは、ポート `3001` を使用し、同じWi-Fi内から接続できるよう
`0.0.0.0` でNext.jsを待ち受けさせます。

## URL

- 起動したPC: `http://localhost:3001`
- 同じWi-Fi内のスマートフォン等: `http://<PCのIPv4アドレス>:3001`

PCのIPv4アドレスはPowerShellで確認できます。

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.InterfaceOperationalStatus -eq "Up" } |
  Select-Object InterfaceAlias, IPAddress
```

例としてIPv4アドレスが `192.168.1.15` の場合、プレビューURLは
`http://192.168.1.15:3001` です。IPv4アドレスはネットワーク接続ごとに
変わる可能性があります。

## 停止

起動したPowerShellで `Ctrl+C` を押します。

## 接続できない場合

1. PCと確認端末が同じWi-Fiに接続されているか確認する。
2. 起動時に表示されたエラーを確認する。
3. ポート3001を別のプロセスが使用していないか確認する。
4. Windows Defenderファイアウォールの確認画面が出た場合は、信頼できる
   プライベートネットワークに限ってNode.jsの通信を許可する。

この方式はローカル確認専用です。インターネット上へ公開する場合はVercelの
本番デプロイを使用します。
