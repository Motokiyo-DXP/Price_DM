# 主要5ページの遷移遅延：Solへの調査引き継ぎ

調査日：2026-09-08。対象：https://dm-price-tracker.vercel.app

## 実装状況（2026-09-08追記）

ユーザーの続行指示を受け、以下を実装した。

- 動的4ページに `loading.tsx` を追加し、共通の読み込みUIを表示。
- デッキ検索のprofiles取得とcard_prints取得を並列化。
- デッキ検索と一人回しのcard_prints取得を代表カードIDだけに限定。
- 代表カード・指定版の選択規則を `lib/deck-icon.ts` に切り出し、回帰テストを追加。

型チェック、`test:decks` 16件、`test:images` 12件、本番ビルドに成功。ローカル本番ビルドで4ページの即時読み込み表示と実データへの切替を確認し、ブラウザーエラーは0件。本番へのデプロイは行っていない。以下は実装前調査の記録として残す。

## 当初の依頼と調査範囲

当初は原因解明と指針立てまでを行い、その後のユーザー指示で修正作業へ移行した。DB変更とデプロイは行っていない。サブエージェントは使用していない。

対象：ホーム `/`、デッキ検索 `/deck-search`、マイデッキ `/decks`、一人回し `/solo`、オンライン `/rooms`。

## 実測結果

本番のログイン済みブラウザーで主要ナビゲーションのリンクをクリックし、URL一致＋遷移先h1の表示を待った。ホームは「カード検索」入力欄の表示を待った。下記順序で3巡。時間はブラウザー制御側のDate.nowによる操作開始〜待機完了で、ツールの処理時間を含む。画像decode完了・操作可能性・純粋なサーバー時間の指標ではない。3回だけなのでp95ではない。ウォーム／コールドを厳密には制御していない。

| 遷移先（巡回順） | 1巡目 ms | 2巡目 ms | 3巡目 ms | 中央値 ms |
|---|---:|---:|---:|---:|
| デッキ検索 | 2610 | 1476 | 1681 | 1681 |
| 一人回し | 2515 | 1912 | 1531 | 1912 |
| オンライン | 1791 | 1477 | 1550 | 1550 |
| ホーム | 453 | 446 | 493 | 453 |
| マイデッキ | 2005 | 1444 | 1452 | 1452 |

巡回開始前はマイデッキ。したがって初回はマイデッキ→デッキ検索、以後も同じ循環。全20方向の組み合わせは未測定。別の初回ホーム→デッキ検索は1938ms。

未ログインのHTTP GETも確認：デッキ検索200、TTFB 2.259秒、総時間2.261秒。他の3ページは307（ログインへの転送）なので、その応答時間をログイン後のページ性能として扱わない。

## 確認できた原因・構造

### 1. 動的4ページにloading境界がなく、データ取得完了待ちがそのまま遷移待ちになる

- `components/primary-navigation.tsx` はNext Linkを使用済み。主要ナビをa→Linkに変更する提案は不要。
- `app/deck-search/page.tsx`、`app/decks/page.tsx`、`app/solo/page.tsx`、`app/rooms/page.tsx` はforce-dynamic。
- `loading.tsx` は調査開始時点で存在しない。
- 各ページが認証やDB取得をawaitしてから本文を返す。ホームだけはISR 300秒。
- ローカルの `npm run build` 成功。ビルド表もホーム静的、他4ページ動的を確認。
- 根拠：Next.js公式は動的ルートへのloading.tsx追加を、部分先読みと即時遷移の手段として推奨している。

方針：対象ページに適切なloading境界を設ける。見出し、読み込み状態（role=status等）、コンテンツに近い形状を先に表示し、共通ナビは操作可能に保つ。ルートグループの大規模再編は不要。ルート直下にloadingを置く場合は対象外ページへの波及と、子ルートにも継承されることを評価する。表示だけを速くして本文完了時間の改善と報告しない。

主要ページの全データを `prefetch={true}` で無条件に先読みする案は第一選択にしない。認証・一覧取得の負荷に加え、roomsのGETレンダリングにはルーム整理の更新処理がある。まずloading境界による部分先読みを検証する。

### 2. デッキ検索に不要な直列待ちがある

`app/deck-search/page.tsx` の順序は decks → profiles → card_prints →画像選択→描画。

profilesとcard_printsはどちらもdecksの結果からIDを作るだけで、互いに依存しない。decks取得後にPromise.allで並列化できる。decks自体の取得は後続に必要なので並列化対象ではない。

### 3. デッキ検索・一人回しで代表画像以外の版情報も取得している

両ページはメインデッキ全カードのcanonical_card_idでcard_printsを取得し、全版を発売順にソートするが、表示するのは各デッキの代表画像1枚。代表IDは `icon_canonical_card_id ?? main[0]?.canonical_card_id`。

本番配信JSと.env.localのSupabase接続先が同一であることを値を公開せず比較して確認。公開キー・未認証のSELECTだけで、現在の公開デッキを取得する試験を実施。ユーザーの非公開デッキや認証トークンは取り出していない。

| 試験 | decks ms | profiles ms | 全カード版情報 ms | 代表カード版情報 ms | profiles＋代表版並列 ms |
|---|---:|---:|---:|---:|---:|
| 1 | 1364 | 50 | 307 | 57 | 92 |
| 2 | 47 | 29 | 70 | 31 | 54 |
| 3 | 39 | 31 | 41 | 42 | 53 |

- 公開デッキ5件、decks JSON 10,370 bytes。
- 現状：61カードID、470版、JSON 103,038 bytes。
- 代表カード限定：5カードID、24版、JSON 5,317 bytes。約94.8%減。
- 全版ソート：6 / 2 / 2 ms。この試験ではソートCPUより、取得範囲と通信待ちを優先すべき。
- 各代表カードの最古版image_keyは両取得方法で一致した。
- bytesはJSON.stringify後のUTF-8長であり、HTTP圧縮後の転送量ではない。
- ローカルPC→Supabaseの試験でありVercel→Supabaseの時間ではない。試験順序による接続・キャッシュの影響がある。20%の本番高速化を証明するものではない。
- ブラウザーで最初に見た公開デッキ数は1件、その後のSELECTでは5件。ライブデータが変わり得るため、修正前後は同じ件数・条件で比較する。
- 再現用の読み取り専用スクリプト：`.local/navigation-query-probe.mjs`。`node --env-file=.env.local --experimental-strip-types .local/navigation-query-probe.mjs`。アプリコードには組み込んでいない。

方針：デッキ検索と一人回しでは、代表IDだけをcard_prints条件に使う。代表カードにcard_print_idが指定されているときはその版を優先し、取得できないときは現在の最古版選択を保つ。代表IDがmain外の場合、画像なし、デッキなし、代表ID未設定も保持する。

注意：`app/decks/page.tsx` はMyDecksBrowserへ全カードのiconChoicesを渡す。ここまで代表IDだけにするとアイコン選択機能を壊すので、同じ絞り込みを機械的に適用しない。decksとdeck_foldersも既にPromise.all済み。

### 4. 本番ホームのSSR HTMLとクライアント描画が一致していない

- 本番トップ初回と再読み込みでReact #418（hydration mismatch）を観測。
- HTTP取得したホームHTML全体に「主要ページ」「primary-navigation」がない。ヘッダーと一覧はある。x-vercel-cache=HIT、age=17だった。
- 動的 `/deck-search` のHTMLには主要ナビがある。x-vercel-cache=MISS。
- 両ページは同じ `app/layout-c11cc27cf863af2d.js` を配信。そこには `/` を含むvisiblePathsとPrimaryNavigation実装がある。
- ブラウザーの読み込み後DOMには主要ナビが現れる。
- 現在のローカルコードを本番ビルドした `.next/server/app/index.html` には主要ナビがある。

したがって本番のHTMLとクライアント描画の不整合は確認済み。しかし、旧成果物、ISRキャッシュ、pathnameのサーバー側評価など、どの経路で不整合が作られたかは未特定。これが動的4ページの1〜2秒の全原因だとは断定しない。

方針：本番のdeployment ID/commitと生成HTML・ISRの状態を確認し、整合したプレビュー成果物で再現比較する。再現しないコードに `suppressHydrationWarning`、マウント後表示、CSS隠蔽を追加しない。現在のコードの再ビルドだけで解消するか検証してから変更の要否を決める。

HTTP証拠は `.local/navigation-home.html` と `.local/navigation-deck-search.html`。公開ページ本文を含むので、必要な判定だけ引用し、ファイル全体を外部へ添付する必要はない。

## 条件付きの改善候補

### オンラインの画面表示前にルーム整理をawaitしている

`app/rooms/page.tsx`：getClaims → retire_stale_game_rooms → Promise.all(招待数, 再接続可能ルーム)。整理RPCは全未退役ルームのpresenceを集計し更新する実装。単なる読取りではない。

`supabase/migrations/20260902132000_schedule_game_room_retention.sql` には1分周期のcronが既に定義されている。ただし本番で適用済み・正常実行中かは未確認。`list_resumable_game_rooms` はステータスとexpires_atを条件にし、整理処理の結果が表示に影響し得る。

Solは稼働中cronと直近成功履歴、整理RPCの所要時間を確認してから、描画の必須経路から外せるか判断する。無条件の削除や再接続一覧との並列化をしない。retentionの意味を維持する。ここは今回、RPC別の本番時間を測れていない。

### ヘッダーロゴ経由のホーム移動

`app/layout.tsx` のロゴは通常のaなので、これを使うとフルナビゲーションになる。主要ナビはLinkなので上記巡回の原因ではない。ユーザーがロゴも使う場合はLink化を小さな別変更として検証可能。

## 目標と完了条件

1. **応答性**：本番ビルド・hydration完了・部分先読み完了の条件で、クリックから遷移先の読み込み状態または本文の最初の描画までp95 300ms以下を目標にする。少なくとも20試行程度で評価。今回の3回のツール計測から達成を判定しない。
2. **本文完了**：同じデータ量・認証・回線・キャッシュ条件で、デッキ検索の本文表示中央値を修正前比20%以上短縮する暫定目標。他ページを有意に悪化させない。未達なら取得段階別の時間を見直し、推測のパッチを増やさない。
3. **取得量**：デッキ検索・一人回しは代表画像に必要な版情報だけに絞り、現行の画像選択結果を維持。今回の公開5件では103,038→5,317 bytes相当が検証用目安。実HTTP転送量とは別に記録。
4. **整合性**：本番相当のホーム再読み込みでSSRナビが存在し、React #418が再現しないこと。もし既存本番だけで残るなら未解決として明記。

通信条件が未制御の単発最速値、ローディングだけの高速化、画像がまだ見えない状態を「ページ表示完了」と呼ばない。全ページの最大300ms保証を約束しない。

## Solでの実施順序

1. git diff/status確認。他タスクが同時に変更している。調査開始時HEADはf363f04。後から `app/globals.css` と `lib/online-room-snapshot.test.mjs` に変更が現れたが、このタスクの変更ではない。巻き戻さない。
2. 本番成果物とホームHTMLの不整合を切り分ける。Vercel connectorのget_projectは `.vercel/project.json` のIDで404だった。権限／接続先の問題とプロジェクト不存在は区別する。旧引き継ぎ文書の「未デプロイ」は現在の本番状態と一致しないので鵜呑みにしない。
3. loading境界を小さく追加し、動的ルートの先読みと即時フィードバックを本番ビルドで確認。
4. デッキ検索のprofiles/prints並列化、デッキ検索とsoloの代表画像取得範囲を修正。必要な画像選択回帰テストを追加。
5. roomsはRPC計測とcron稼働確認後に判断。認証を省略したり私有データを共有キャッシュに入れたりしない。
6. 型チェック、本番ビルド、変更に関連する既存テスト（test:decks、test:images、roomsに触れたらtest:rooms）を実施。プロジェクト必須チェックに従う。package.jsonのlintはnext lintで、導入済みNext 15.5.21に対し使えるか確認する。
7. ログイン済み／未ログイン、PC／モバイル、初回／再訪、戻る／進む、連打で古い応答が上書きしないことを検証。5ページ間の全20方向を確認。検索、アイコン選択、デッキ編集反映、公開→非公開、ルーム招待・再接続の鮮度も変更リスクに合わせて確認。
8. 修正前後で同じ条件を使い、クリック→フィードバック、本文の操作可能時点、画面内画像の表示完了、RSC/DBの時間と量を分けて記録。現行CUAのread-only evaluateではperformance APIが未公開で、Resource Timingは取れなかった。適切な開発用計測手段を用意する。

## 作業環境と実施済み検証

- このタスクは修正を行っていない。最初の実装依頼時に準備した `.local/navigation-check` は隔離検証用コピー。node_modulesは元プロジェクトへのjunction。再帰削除時にjunction先へ触れないこと。最初の隔離buildはSVGコピー不足で失敗し、その後元ワークスペースでnpm run buildが実行され成功した。`.next` は再生成されている。
- 既存3001番ポートのサーバーは停止していない。元の `.next` を再生成したため、開発サーバーに不調が出たらその事実を踏まえて復旧する。
- 終了時の3001番へのHTTP確認はstatus=000で接続できなかった。このタスクから停止操作はしておらず、終了原因は未確認。Solでローカル検証を始める際は既存プロセスと他タスクの利用状況を確認して起動する。
- 追加のアプリ起動、変更後UI検証、全テスト、修正後性能測定は未実施（修正自体が依頼範囲外になったため）。
- ログイン情報は取得・保存していない。本番ブラウザーはユーザーのログイン済み状態で測定した。

## 一次資料

- Next.js Linking and Navigating：https://nextjs.org/docs/app/getting-started/linking-and-navigating
- Next.js Prefetching：https://nextjs.org/docs/app/guides/prefetching
- Next.js Loading UI：https://nextjs.org/docs/13/app/building-your-application/routing/loading-ui-and-streaming （15版URL取得に失敗したため基礎説明の補助。導入済みバージョンは15.5.21）
- Supabase select：https://supabase.com/docs/reference/javascript/select
- Supabase changelog：https://supabase.com/changelog （changelog.mdを取得して関連破壊的変更を確認。今回のSELECT・並列化方針に影響するものは見つからなかった）
