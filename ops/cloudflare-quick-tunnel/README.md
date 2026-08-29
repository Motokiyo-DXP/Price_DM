# Cloudflare Quick Tunnel（開発確認用）

アカウントや独自ドメインなしで、常時稼働PCの画像サーバーを一時的なHTTPS URLへ接続します。

常時稼働PCでWindows PowerShellを管理者として開き、次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File "C:\dm-card-images\_tunnel\install-quick-tunnel.ps1"
```

成功すると `https://...trycloudflare.com` のURLが表示されます。これは開発確認専用で、PCやタスクの再起動後に変わる可能性があります。本番運用ではCloudflare管理下の独自ドメインを使う固定トンネルへ切り替えます。
