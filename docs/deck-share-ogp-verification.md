# デッキ共有OGPのローカル検証

## 変更と原因

`/deck-search?share=...` に動的メタデータがなく、ルートの共通タイトルを継承していた。
共有デッキの取得はブラウザ側の既存API呼び出しで行われ、クローラー向けOGP画像も存在しなかった。

既存の画像はカード1枚を代表画像にする仕組みで、共有用の横長画像はなかった。
今回、代表カードを優先し、メインデッキの最大6種類のカードを1200×630のPNGに合成する。
保存された版の画像を優先し、既存の版選択・ページング処理を再利用する。

`generateMetadata` がデッキ名、説明、共有URL、OGP/Twitter画像を設定する。
`htmlLimitedBots: /.*/` により、ブラウザも含め初回HTMLのheadにメタデータを出力する。
この設定はアプリ全体のメタデータストリーミングを無効化する。
画像URLには共有トークンと内容ハッシュを含め、画像レスポンスは `no-store`。
画像の取得時にも毎回公開状態を検査する。取得失敗時は共通画像を返す。

## 公開範囲とリリース上の依存

既存のshare値はデッキIDではなく専用トークン。既存RPCはトークンで非公開デッキも閲覧できる仕様。
閲覧・複製の既存APIは変更せず、OGP専用の `get_public_shared_deck` RPCを追加した。
このRPCは現在公開中のデッキだけを返す。非公開・無効・不存在は共通メタデータと画像になる。
一度SNSが保存したプレビューの撤回までは保証できない。

マイグレーション `20261020145639_public_shared_deck_ogp.sql` は本番未適用。
将来のリリース時には、コミット済みマイグレーションを専任リリースセッションで適用する必要がある。
未適用の環境では安全側に倒し、共有OGPは共通表示となる。

## 検証範囲

本番資格情報を使わず、PGliteとローカルHTTPのSupabase互換テストサーバーで検証。
実際の既存共有RPC定義と追加マイグレーションを読み込み、匿名権限のEXECUTEと公開判定を検査した。
完全なSupabase/PostgREST環境や本番データを使った検証ではない。
初回は識別用の色付きWebPフィクスチャで検証した。
リリース前には、公開デッキ「トリーヴァロスクル」「デスガードマン」の匿名閲覧APIから
実カード画像を読み取り、隔離環境の画像ソースとして統合テストを再実行した。
クサビナメコノヌシとDの光陣 ムルムル守神宮を含むPNGの描画を目視確認した。
SNS実機での表示確認は未実施。

検証済み項目:

- A/Bそれぞれのデッキ名、個別画像URL、異なるPNG内容。
- LINE、Discord、Twitter、通常ブラウザのUser-Agentでhead内のOGPを取得。
- og:title / og:image / og:description / og:url / twitter:title / twitter:image。
- 匿名で画像取得、1200×630、PNG、no-store。
- 非公開・不存在・不正形式への共通表示。
- 改名後のタイトル・画像URL更新。
- 非公開化後、以前の画像URLでもデッキ情報を出さない。
- 画像取得失敗時の共通画像。
- 既存共有閲覧APIで40枚を取得。ブラウザでBの共有閲覧モーダルと名前を確認。
- 関連デッキテスト48件、DB安全性テスト8件、型チェック、ビルド成功。

ビルド時は既存CSSのautoprefixer警告と、DB接続未設定による市場データ取得のログあり。
ビルド終了コードは0。UIの検索・編集処理への変更はない。

## 再実行

作業ツリーのルートで、テスト専用依存をインストール:

```powershell
npm install --prefix .local/ogp-test --no-audit --no-fund @electric-sql/pglite
node scripts/fixtures/deck-share-ogp-server.mjs
```

別ターミナルで（3000が空いていることを確認）:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:43127'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='local-fixture-only'
$env:NEXT_PUBLIC_CARD_IMAGE_BASE_URL='http://127.0.0.1:43127/images'
npm run dev -- --hostname 127.0.0.1
```

さらに別ターミナルで:

```powershell
$env:OGP_FIXTURE_TEST='1'
node --test scripts/deck-share-ogp.integration.test.mjs
npm run test:decks
npm run test:db-safety
npm run typecheck
```

統合テストはテストデータを改名・非公開化するため、再実行前にフィクスチャサーバーを再起動する。
実画像を使う場合は、公開カード画像URL2件のJSON配列をローカルファイルに保存し、
サーバー起動時の `OGP_REAL_CARD_IMAGES` にファイルパスを設定する。
画像とHTMLの証跡は `.local/ogp-test/evidence/` に生成される。
ビルドは開発サーバーを終了してから `npm run build` を実行する。

## 将来の本番反映後の確認とLINEキャッシュ

1. 公開デッキA/Bの実際の共有URLを取得する。
2. 未ログインのHTTPクライアントでHTMLを取得し、head内のOGPと画像URLがデッキごとに異なることを確認する。
3. og:imageを直接開き、200・PNG・1200×630と実カード画像を確認する。
4. LINEのトークに各URLを新たに貼り付け、名前・画像・タップ後の閲覧先を確認する。Discord・Xでも確認する。
5. 改名後、HTMLのタイトルと画像URLの `v` が変化したことを先に確認する。
6. HTMLが最新でもLINEが旧表示なら、LINE側に保存されたプレビューと切り分ける。
   診断用に元URLへ `&preview_check=任意の新しい値` を付けて新規貼り付けを試せるが、
   再取得や既存メッセージの更新は保証しない。サーバーのno-storeだけでSNSの保存内容は削除できない。

LINEが使用する主要タグは[公式FAQ](https://developers.line.biz/en/faq/)で確認した。
全User-Agentでhead内メタデータを返す設定は[Next.js公式ドキュメント](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots)に従う。
