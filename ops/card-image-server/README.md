# 常時稼働PC用カード画像サーバー

`C:\dm-card-images` 内のWebP画像だけを、LAN内へHTTP配信します。

## 初回設定

常時稼働PCで「Windows PowerShell」を管理者として起動し、次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File "C:\dm-card-images\_server\install-image-server.ps1"
```

セットアップにより、以下が自動設定されます。

- TCP 8787番へのLAN内限定ファイアウォール許可
- Windows起動時にSYSTEM権限で開始するタスク
- セットアップ直後のサーバー起動とヘルスチェック

## 確認用URL

- ヘルスチェック: `http://192.168.1.9:8787/health`
- 画像例: `http://192.168.1.9:8787/official/dm26ex2-MC001.webp`

この段階ではLAN内限定です。インターネット公開はCloudflare TunnelなどでHTTPS化してから行います。
