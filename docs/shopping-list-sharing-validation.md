# ホーム画像拡大・買い物リスト共有のローカル実装記録

> 10/17時点の履歴です。10/19の追加検証・セッション失効修正は `shopping-sharing-release-20261019.md` を参照。

確認日: 2026-10-17（日本時間）

## 作業範囲

- 正本: `Motokiyo-DXP/Price_DM`。`git fetch price-dm` 後の `price-dm/main`: `5d46267f69d0cce4c1ce89785a72144311589b86`。
- 専用worktree: `C:\Users\mossa\.codex\worktrees\shopping-sharing-20261017\Price_DM`。変更は未コミット。
- 正本チェックアウトの既存未コミット変更は保持。
- push、PR作成、本番DB操作、Vercel操作、Oracle利用は実施していない。
- テスト用サーバーは終了済み。常駐プレビューは起動していない。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `components/expandable-card-artwork.tsx` | 共通画像モーダル。既存CardArtworkの回転・代替画像を再利用。背景・閉じるボタン・Esc、Tab制御、フォーカス復帰、スクロール抑止。 |
| `components/market-list.tsx` | 画像の詳細リンクを拡大ボタンへ変更。検索結果レイアウトと既存のカード名・詳細リンクを維持。 |
| `app/register/page.tsx` | 選択中のカード画像に共通モーダルを適用。フォームを再マウントしない。 |
| `lib/card-detail-data.ts` | 価格サマリーがなくてもcanonical_cards本体が存在すれば空価格の詳細を表示。本体の取得失敗と存在しないIDを区別。 |
| `app/shopping-list/page.tsx` | 所有者の認証確認、共有操作とライブ表示の組み込み。 |
| `components/shopping-list-sharing.tsx` | フレンド共有設定、受信リスト、URL発行・停止・コピー。 |
| `components/shopping-list-live.tsx` | SSE購読、接続断時の表示解除、再接続・オンライン復帰・画面復帰時の再取得。 |
| `components/shopping-list-view.tsx` | 既存集計表示を閲覧専用画面にも利用。全件解除を本人の正本全体に対して実施。 |
| `lib/shopping-list-data.ts` | 既存のカード・画像・店舗・価格取得処理を共通化。取得失敗を空データと混同しない。 |
| `lib/shopping-share-access.ts` | URLトークン・共有IDの検証、認証方式の混在・重複パラメーターの拒否。 |
| `app/api/shopping-list/live/route.ts` | 権限を毎秒再確認するSSE。共有データはno-storeで配信。 |
| `app/shopping-list/shared/[token]/page.tsx` | 未ログインで開けるURL共有画面。noindex・no-referrer。 |
| `app/shopping-list/friends/[shareId]/page.tsx` | 明示的に許可されたフレンド向けの共有画面。 |
| `app/globals.css` | モーダルと共有操作のダークテーマ・黄色アクセント、スマートフォン幅への対応。 |
| `middleware.ts` | 買い物リスト・SSE接続時の認証更新対象を追加。 |
| `lib/database.types.ts` | 新規RPCの型。 |
| `supabase/migrations/20261016181706_shopping_list_sharing.sql` | 共有設定、フレンド許可、権限付き読取RPC、フレンド解除トリガー。 |
| `scripts/shopping-sharing-db.test.mjs` | PGlite上の実PostgreSQL権限・RLS・RPC検証。 |
| `scripts/shopping-sharing-fixture.mjs` | ループバック限定のAuth/PostgREST通信アダプター。共有RPCとブックマーク変更は隔離DBを利用。 |
| `tests/shopping/shopping.spec.mjs` / `playwright.shopping.config.mjs` | PC・スマートフォン幅と2ブラウザープロセスでの画面・同期検証。 |
| `lib/shopping-share-access.test.mjs` / `lib/shopping-list.test.mjs` | URL入力検証を追加、既存の店舗取得検証を共通取得先へ更新。 |
| `package.json` / `package-lock.json` | テストコマンド、バージョン固定したPGlite・Playwright開発依存を追加。 |

## 原因と解消

画像全体が詳細ページへのリンクになっており、詳細取得は価格サマリーがなければカード自体も存在しないと判断していた。画像は共通モーダルへ変更し、詳細取得はカード本体の存在も確認するようにした。

2ブラウザー検証では、別画面で追加した直後の全件解除が、まだ表示に届いていないカードを削除しない問題も再現した。表示中のID配列を削除する方式から、認証済み本人のブックマーク全体を削除する方式へ変更した。

## 権限設計と更新方式

- カード一覧の正本は引き続き `account_card_bookmarks`。共有用のカード一覧を保存しない。
- 共有設定はprivateスキーマに保存し、RLSを有効化。anon/authenticatedにテーブル直接アクセス権を与えない。
- フレンド共有は明示的な許可とacceptedのフレンド関係を毎回照合。フレンド解除時は両方向の共有許可も削除し、再登録しても復活させない。
- URLトークンは独立したランダムUUID2個から生成する64桁の値（244ランダムビット）。ユーザーIDを含めず、停止後の再発行では値を変更する。
- 本人用RPCはauth.uidで所有者を確定する。他人のリスト取得RPCは許可または有効トークンを検証し、カードIDだけを返す。
- SECURITY DEFINER実装はprivateスキーマに置き、空のsearch_path、明示的なEXECUTE権限、関数内の認可を設定。公開側はSECURITY INVOKERのラッパー。
- ブックマークの既存RLSは本人限定のまま。共有相手向けの書込RPCは設けない。デッキ共有RPCは変更しない。
- 更新はSSEとサーバー側の毎秒RPC確認を使用。Supabase Realtimeの公開チャンネルやブックマーク変更イベントを共有相手へ流さない。
- リスト変更時に価格・画像を再取得し、変更がない場合も価格は30秒ごとに再取得。遅い取得後は配信前に権限・カードIDを再確認する。
- DB上の解除は次の読取から失効し、既存の閲覧画面は通常次の毎秒確認で非表示になる。切断中の表示は接続エラー・offlineイベント・10秒の無応答監視で破棄する。
- ストリームは50秒で再接続し、オンライン復帰と画面復帰でも最新状態を取得する。API応答はprivate/no-store。認証情報・所有者ID・ブックマーク日時は共有レスポンスに含めない。

## 実行結果

以下は最終変更を含む確認結果。全テストスイートの一括実行ではなく関連スイートの実行。

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm run build` | 成功。既存CSSのautoprefixer警告、Supabase接続情報未設定によるホームのフォールバックログあり。本番接続情報は読み込んでいない。 |
| `test:market` / `test:card-detail` / `test:favorites` / `test:routes` | 10 / 5 / 17 / 5件成功 |
| `test:images` | 25件成功（画像同期テスト4件を含む） |
| `test:db-safety` | 8件成功。関連worktreeにも今回のmigration番号の衝突なし。 |
| `test:prices` / `test:friends` | 23 / 4件成功 |
| `npm run test:shopping-sharing` | 11件成功。実SQLのロール、RLS、権限付きRPCを隔離PostgreSQLで実行。 |
| `npm run test:shopping-browser` | 6件成功 |
| `git diff --check` | 成功 |

ブラウザーではPC 1280×900、スマートフォン幅390×844で拡大・閉じるボタン・背景・Esc・Tab・フォーカス復帰・スクロール復帰・検索条件・並び順・フォーム入力保持を確認。価格登録済み・未登録・画像未登録、既存90度補正を確認した。モーダルのスクリーンショットも確認し、閉じるボタンが画面外へ欠けないことを検証した。

独立したChromiumプロセス2つと複数の認証コンテキストで、所有者・許可フレンド・非許可ユーザー・未ログインURL閲覧、コピー、販売・買取の店舗集計、価格未登録表示、お気に入り追加・解除・全件解除、通信切断・復帰、URL停止後の既存接続と再読込、フレンド共有解除を確認した。他人のブックマークを追加する試行もRLSで拒否された。

## 未検証とリリース前の作業

- DockerのローカルSupabaseは利用できなかったため、DBはPGlite、ブラウザーのAuth/PostgRESTはテスト用アダプター。既存migrationからブックマーク・フレンドの関連テーブルを構築して今回のmigrationを実行しており、全履歴の適用試験ではない。
- カード画像はテスト用画像で回転経路を検証した。実カード画像の視覚的な向き、スマートフォン実機2台、実Supabase Auth/PostgRESTを通る操作、実ネットワークでの復帰は未検証。
- リリース前に、隔離した実Supabase環境で全migration履歴と今回のmigrationを検証し、実ユーザー・実画像・実機で権限と同期を確認する。
- SSEは閲覧接続ごとに毎秒のRPCと定期再接続を使う。配信環境でのストリーム非バッファリング、接続数に対するDB負荷・実行時間・費用を確認する。
- 本番migrationは未適用。将来の本番操作には別途明示承認、migrationソースのコミット、専任リリース担当者の指定・競合確認が必要。
