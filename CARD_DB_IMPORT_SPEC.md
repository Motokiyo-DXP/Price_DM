# Card DB Import Specification

調査日: 2026-09-15。対象: 接続済み Supabase PostgreSQL の `public` スキーマと現行リポジトリ。DB は読み取り専用で確認した。本書は投入の承認ではない。公式ページの取得権限・利用条件は投入時に別途確認する。

## 1. 現在のDB構成

- `tcg_games` の `slug='duel-masters'` に属する `canonical_cards` がカード名単位、`card_prints` が公式詳細ページ/再録単位。`cards` は旧互換テーブルで、新規公式収録の主たる投入先ではない。`card_products` は商品と発売日、`card_search_terms` は検索語。`price_records`、`deck_cards` 等は既存カードIDを参照する利用側で、カード投入時に自動作成しない。
- 関連 View: `card_price_summary`, `card_market_summary`, `canonical_card_market_summary`（価格の集計、カード投入の書込先ではない）。関連 RPC/関数: `normalize_card_search`, `search_cards`, `search_canonical_cards`, `search_canonical_cards_with_images`, `list_card_prints`, `load_market_cards_with_images`, `search_deck_cards_by_usage`, `deck_filter_options`, `search_deck_cards_filtered`、価格表示系 `get_canonical_card_*`。フィルタの `private.*_impl` は内部実装。DB照会で対象5テーブルの Trigger は **0件**。検索語は自動生成 Trigger ではなく import SQL が明示的に追加する。
- 主要定義: `supabase/migrations/20260717054158_initial_tcg_price_schema.sql`, `20260717165209_canonical_card_foundation.sql`, `20260829120000_card_print_images.sql`, `20260829141609_add_card_cost_and_civilizations.sql`, `20260831125836_add_card_types.sql`, `20260902180000_track_card_metadata_sync.sql`, `20260908120000_add_official_product_release_dates.sql`。検索の現行正規化は `20260904145716_ignore_non_letter_characters_in_card_search.sql`、画像検索は `20260906190323_optimize_card_image_search.sql`、絞り込みは `20260914111514_deck_card_filters.sql`。ライブの列・制約・関数存在を照合済み。
- 対象テーブルの主要 Index: `canonical_cards_active_name_uidx`（生存 `(game_id,name)`）、`canonical_cards_name_trgm_idx`, `canonical_cards_cost_idx`, `canonical_cards_civilizations_gin_idx`, `canonical_cards_card_types_gin_idx`, `canonical_cards_game_id_idx`。`card_prints_official_card_id_uidx`（生存かつ非NULL）、`card_prints_image_key_idx`（非NULL）、`card_prints_legacy_card_id_key`, `card_prints_canonical_card_id_idx`, `card_prints_card_number_trgm_idx`, `card_prints_product_name_trgm_active_idx`, `card_prints_product_id_idx`。`card_products_game_id_product_code_key`。`card_search_terms_canonical_card_id_normalized_term_term_ki_key`, `card_search_terms_normalized_trgm_idx`, `card_search_terms_card_id_idx`。各テーブルの `id` に PK Index がある。旧 `cards` は `(game_id,name,card_number)` unique と名前/読みの trigram・正規化 Index、`game_id` Index。

## 2. カードテーブル

以下はライブの `information_schema.columns` と `pg_constraint` による全カラム。`自`=DB identity/default、`C`=ChatGPT 入力、`X`=Codex が既存DB参照/運用で設定、`―`=通常投入しない。`NULL` は DB の許可であり、入力必須とは異なる。JSON/JSONB 列およびカード属性の enum 列は **ない**。配列は `text[]`。

## 3. カラム仕様

| テーブル.カラム | 型 | NULL / default | キー・制約 / 入力担当と意味 |
|---|---|---|---|
| canonical_cards.id | bigint | 不可 / identity always | PK、自。入力禁止 |
| canonical_cards.game_id | bigint | 不可 / なし | FK `tcg_games.id` restrict、X: slug で解決 |
| canonical_cards.name | text | 不可 / なし | 生存 `(game_id,name)` unique、C: 公式名。カード名の表記を維持 |
| canonical_cards.name_kana | text | 可 / NULL | C: 公式で確認できた読みのみ。現行収集は `null`、別の読み生成処理は機械読み |
| canonical_cards.source_name | text | 不可 / なし | C由来、X: 元の公式名。既存 builder は正規化後の `name` を入れる |
| canonical_cards.source_name_kana | text | 可 / NULL | ―: 現行 builder は NULL |
| canonical_cards.aliases, aliases_kana | text[] 各 | 不可 / `{}` | ―: 確認済み別名のみ別工程。公式名から推測しない |
| canonical_cards.manually_locked | boolean | 不可 / false | 自/運用。true の既存行は上書きしない |
| canonical_cards.source_checked_at | timestamptz | 可 / NULL | X: 公式確認日時 |
| canonical_cards.created_at, updated_at | timestamptz 各 | 不可 / now() | 自（ただし更新時刻は UPDATE 側が明示設定） |
| canonical_cards.deleted_at | timestamptz | 可 / NULL | ―: soft delete。生存 unique の条件 |
| canonical_cards.cost | smallint | 可 / NULL | CHECK NULL または 0–99、C: 印刷コスト。空欄/適用なしは NULL、0 と区別 |
| canonical_cards.civilizations | text[] | 不可 / `{}` | CHECK 6種類の部分集合、最大6要素。C: 公式文明を slug 配列へ |
| canonical_cards.card_types | text[] | 不可 / `{}` | CHECK 最大8、空文字要素禁止。C: 公式「カードの種類」；複数面は複数値 |
| canonical_cards.metadata_synced_at | timestamptz | 可 / NULL | ―: メタデータ同期専用。基本 import は設定しない |
| card_prints.id | bigint | 不可 / identity always | PK、自 |
| card_prints.canonical_card_id | bigint | 不可 / なし | FK canonical restrict、X: `(game_id,name)` で解決 |
| card_prints.legacy_card_id | bigint | 可 / NULL | UNIQUE/FK `cards.id` restrict、―: 既存旧カード連携のみ |
| card_prints.official_card_id | text | 可 / NULL | 生存・非NULL unique、C: 詳細URLの `id`。新規投入時必須 |
| card_prints.card_number | text | 可 / NULL | C: 公式番号を表記通り。単独 unique ではない |
| card_prints.product_name | text | 可 / NULL | C: 公式収録名。`card_products.product_name` と別列 |
| card_prints.official_url | text | 可 / NULL | C: `https://dm.takaratomy.co.jp/card/detail/?id=...` |
| card_prints.manually_locked | boolean | 不可 / false | 自/運用。true は上書きしない |
| card_prints.source_checked_at | timestamptz | 可 / NULL | X: 公式確認日時 |
| card_prints.created_at, updated_at | timestamptz 各 | 不可 / now() | 自/更新時 X |
| card_prints.deleted_at | timestamptz | 可 / NULL | ―: soft delete |
| card_prints.image_key | text | 可 / NULL | UNIQUE 非NULL、CHECK 英数字 `_` `-` の `/` 区切り。X: 画像同期後に設定 |
| card_prints.image_width, image_height | integer 各 | 可 / NULL | 両方 NULL または両方正、X: 変換画像の実測 |
| card_prints.image_byte_size | integer | 可 / NULL | NULL または正、X: 実ファイル容量 |
| card_prints.image_updated_at | timestamptz | 可 / NULL | X: 画像同期時刻 |
| card_prints.product_id | bigint | 可 / NULL | FK `card_products.id` restrict、X: `(game_id,product_code)` でリンク |
| card_products.id | bigint | 不可 / identity always | PK、自 |
| card_products.game_id | bigint | 不可 / なし | FK game restrict、X: slug 解決 |
| card_products.product_code | text | 不可 / なし | `(game_id,product_code)` unique、C: 公式商品コードが判明したときのみ別商品レコードへ |
| card_products.product_name | text | 不可 / なし | C: 商品の正式名称 |
| card_products.release_date | date | 可 / NULL | C: 公式発売日 `YYYY-MM-DD`、不明は NULL |
| card_products.release_date_precision | text | 不可 / `day` | CHECK `day`, `month`, `year`, `unknown`。X: 実際の精度を明示。日付不明時に暗黙 `day` としない |
| card_products.official_url | text | 可 / NULL | C: 商品ページ URL（カード詳細URLとは別） |
| card_products.source_checked_at | timestamptz | 可 / NULL | X: 確認日時 |
| card_products.created_at, updated_at | timestamptz 各 | 不可 / now() | 自/更新時 X |
| card_search_terms.id | bigint | 不可 / identity always | PK、自 |
| card_search_terms.canonical_card_id | bigint | 不可 / なし | FK canonical cascade、X |
| card_search_terms.term, normalized_term | text 各 | 不可 / なし | X: 公式名/確認済み読みと `normalize_card_search(term)` |
| card_search_terms.term_kind | text | 不可 / なし | CHECK `official_name`, `official_reading`, `alias`, `alias_reading`, `face_name`, `machine_reading` |
| card_search_terms.source | text | 不可 / `official` | X: 現行 builder は公式名 `official`、機械読み `generated` |
| card_search_terms.verified | boolean | 不可 / false | X: 公式名 true、機械読み false |
| card_search_terms.priority | smallint | 不可 / 100 | X: 公式名 0、機械読み 50 |
| card_search_terms.created_at, updated_at | timestamptz 各 | 不可 / now() | 自/更新時 X。unique `(canonical_card_id,normalized_term,term_kind)` |
| cards.id, game_id, name | bigint, bigint, text | 不可 / identity, なし, なし | 旧互換 PK、game FK、`(game_id,name,card_number)` unique。新規投入対象外 |
| cards.name_kana, card_number, product_name, official_url | text 各 | 可 / NULL | 旧互換。新規投入対象外 |
| cards.aliases, aliases_kana | text[] 各 | 不可 / `{}` | 旧互換。新規投入対象外 |
| cards.created_at | timestamptz | 不可 / now() | 旧互換。新規投入対象外 |

## 4. 正規化ルール

- 文明: 光=`light`、水=`water`、闇=`darkness`、火=`fire`、自然=`nature`、ゼロ/無色=`zero`。公式セルを `/` `／` `・` で分割し重複除去。DB CHECK は配列順や重複を強制しない。既存多色データの順番にもばらつきがあるため、恣意的にソートせず公式表示順を保持する。色数は `cardinality(civilizations)` の派生値で独立列なし。
- `card_types`: 公式「カードの種類」を文字列配列で保存。DB は閉じた enum **ではない**。2026-09-15 のライブに存在する値は `GR`, `エグザイル・クリーチャー`, `オーラ`, `クリーチャー`, `クロスギア`, `サイキック`, `その他`, `タマシード`, `デュエリスト`, `デュエルメイト`, `ドラグハート`, `フィールド`, `呪文`, `城`, `進化クリーチャー`, `進化クリーチャー(墓地進化V)`。これは既存値の一覧で、新しい公式値を禁止する規則ではない。未知値は自動で言い換えずレビュー。
- `cost`: JSON number の整数 0–99、文字列にしない。公式コスト空欄は `null`（0 ではない）。DB コメントは「未登録または非該当」と両義的なので、必須取得失敗と公式空欄を区別するには収集証拠が必要。
- 種族、パワー、能力・フレーバー文、レアリティ、イラストレーター、ルビは現行カードテーブルに **保存列なし**。勝手に列や検索語へ詰めない。HTML/改行の格納契約も存在しない。将来の拡張は別途設計・承認が必要。
- 名前/番号/商品名の全半角・記号は公式表記を維持し、前後空白のみ除く。名前同一性は DB の厳密な text 比較。`normalize_card_search` は検索語用に NFKC→カタカナをひらがな化→英字小文字化→英字/ひらがな/漢字以外を除去する（名前自体は変換しない）。`dm-canonical-equivalents.mjs` に公式IDごとの例外名があるため、同一判定前に既存例外と照合する。読みが公式未掲載なら捏造せず NULL。改行は JSONL のレコード区切り LF、文字列内は JSON escape とする。

## 5. ID生成

`canonical_cards.id`, `card_prints.id`, `card_products.id`, `card_search_terms.id` と旧 `cards.id` は DB `GENERATED ALWAYS AS IDENTITY` の bigint。UUID や入力 `card_id` はこのカードカタログの主キーではない。ChatGPT は生成しない。`game_id`, `canonical_card_id`, `product_id` は Codex が既存行から解決。`official_card_id` は公式詳細 URL のクエリ `id` をそのまま抽出（大文字小文字を勝手に変更しない）。これは ChatGPT が出典として渡せるが Codex が URL と照合する。

## 6. 重複・再録カード判定

同名は生存 `(game_id,name)` に一つの canonical 行、再録・別番号・別画像・プロモは別 `card_prints` 行。収録版の確定キーは生存の **`official_card_id`**（部分 unique Index）。`card_number`、`product_name + card_number`、名前だけでは print の upsert キーにしない。既存 ID と同名異表記・異 canonical の衝突は自動移動せずエラー/人手確認。soft-deleted 同ID行は部分 unique 対象外なので再有効化の判断を別途要する。`manually_locked=true` は現行 builder が更新を回避。`cards` の旧 unique は NULL 番号では重複保証にならない。

## 7. 画像管理

DB は外部画像 URL を保存せず `card_prints.image_key`（拡張子なし）と実測寸法・bytes を保存。表示は `lib/card-image.ts` が `NEXT_PUBLIC_CARD_IMAGE_BASE_URL/<image_key>.webp`（開発時 `/cards/...`）を組み立てる。欠損/読込失敗は `components/card-artwork.tsx` が `/card-back.svg` を表示。`scripts/sync-dm-card-images.mjs` は公式ページ/公式画像から取得し Sharp で幅384px、WebP quality78 に変換、`official/<公式ID>` をキー（`+` と `$` は安全な文字へ置換）、manifest を生成。`scripts/upload-card-images-r2.mjs` は認証付き R2 Worker へ WebP をアップロードし、`scripts/build-dm-card-image-sql.mjs` が manifest から DB 更新SQLを作る。Supabase Storage をこの経路では使わない。ChatGPT の `image_url` だけでは表示されず、Codex による取得・検証・配置/配信・DBキー登録が別途必要。元画像 URL は任意の出典メタデータに留め、現行 builder へは渡さない。

## 8. 関連処理

基本 builder は canonical→print→検索語（`official_name` と非検証 `machine_reading`）をトランザクション内で upsert。`normalize_card_search` と各 Index は書込時にDBが維持し、手動 REINDEX/キャッシュクリアは通常不要。公式読みを `official_reading` に登録する処理はこの builder にはない。商品は `scripts/build-dm-product-release-import.mjs` の別工程で `(game_id,product_code)` upsert と `product_id` リンク。画像も別工程。価格・デッキ参照は追加時に作らない。アプリ側キャッシュの必要性は新規のインポータ設計時に実測する。

## 9. 既存Import処理

| ファイル / 実行 | 入力と役割 |
|---|---|
| `scripts/import-dm-cards-full.mjs` / `npm run import:dm:full` | 公式サイト一覧/詳細の crawler、`.local/dm-cards-full.jsonl` と checkpoint/failures。`parseCardDetail` は `scripts/import-dm-cards-sample.mjs`。公式 robots 等を確認する処理あり |
| `scripts/validate-dm-card-import.mjs` / `npm run validate:dm:import` | 全件 JSONL と checkpoint、metadata/types の網羅・公式URL・重複・禁止項目検証。単独の小規模 ChatGPT ファイルにそのまま適用不可 |
| `scripts/build-dm-card-import.mjs` / `npm run build:dm:import` | 上記 JSONL と `.local/dm-card-metadata.jsonl`, `.local/dm-card-types.jsonl` を名前で merge、SQL chunks と manifest 生成。checkpoint `complete` 必須（試験時のみ `--allow-partial`）。部分入力でも既存 `name_kana` を NULL で上書きし得るため無改造で本番流用しない |
| `scripts/apply-dm-card-import.mjs` / `npm run apply:dm:import:linked -- --confirm-production --project-ref=<linked-ref>` | 完全カタログ manifest、明示確認、リンク先一致を要求して SQL chunks 適用。**今回は実行禁止** |
| `scripts/build-dm-product-release-import.mjs`, `scripts/sync-dm-card-images.mjs`, `scripts/build-dm-card-image-sql.mjs` | 商品発売日・画像の別系統。管理画面からの一般カード import、任意 JSONL の dry-run/件数付き importer は確認できない |

## 10. ChatGPT用入力スキーマ

推奨は UTF-8 JSONL、**1行=公式詳細ページの1収録**。各行は次の許可キーのみ。`source_url` という別キーは使わず既存の `official_url` を出典とする。以下は今後の小規模 importer 用契約案であり、既存スクリプトが完全に受け入れるスキーマではない。

| キー | JSON型 / 必須 | 値・変換 / 生成担当 |
|---|---|---|
| `official_url` | string / 必須、非NULL | HTTPS `dm.takaratomy.co.jp/card/detail/?id=...`、ChatGPT。Codex が host/path/id を検証 |
| `name` | string / 必須、非NULL・非空 | 公式表示名（前後trim）、ChatGPT。Codex が既存例外・同名性を確認 |
| `card_number` | string または null / 必須キー | 公式番号。掲載なしは null。ChatGPT |
| `product_name` | string または null / 必須キー | 公式収録名。掲載なしは null。ChatGPT |
| `name_kana` | string または null / 必須キー | 公式で検証した読みだけ。なければ null。機械生成は Codex 別扱い |
| `cost` | integer 0–99 または null / 必須キー | 公式空欄のみ null。不明/取得失敗はエラー。ChatGPT |
| `civilizations` | 許容 slug の string[] / 必須キー | 公式空欄なら `[]`。情報を取得できなければエラー。ChatGPT |
| `card_types` | 非空 string[] / 必須キー | 公式「カードの種類」を面ごとに保持。取得失敗はエラー。ChatGPT |

`official_card_id` は JSONL に重複入力させず Codex が URL から抽出。商品コード/発売日はカード詳細だけから推測しない。商品ページを別に確認した場合は別 manifest として `product_code` (string), `product_name` (string), `release_date` (`YYYY-MM-DD` または null), `release_date_precision` (`day|month|year|unknown`), `official_url` (string または null) を用意する。`game_id` は `duel-masters` 固定解決。`id`, `canonical_card_id`, `product_id`, `image_key`, `metadata_synced_at`, ロック/時刻/削除列は ChatGPT から受け取らない。

## 11. サンプルデータ

2026-09-15 のDB実在 print から必要フィールドを抜粋した JSONL（公式サイトの再取得・新規投入用の完成データであることまでは保証しない）。1行目が1カード分、4行全体が複数カード分の例。

```jsonl
{"official_url":"https://dm.takaratomy.co.jp/card/detail/?id=dm25ex3-016","name":"魔誕の魔龍虫ビャハ","name_kana":"マ誕ノマリュウチュウビャハ","cost":7,"civilizations":["fire"],"card_types":["クリーチャー"],"card_number":"DM25EX3 16/80","product_name":"DM25-EX3 邪神爆発デュエナマイトパック「王道W」"}
{"official_url":"https://dm.takaratomy.co.jp/card/detail/?id=dm25ex3-rp2S07","name":"轟䡛合体 ゴルギーオージャー","name_kana":"トドロキ䡛ガッタイ ゴルギーオージャー","cost":9,"civilizations":["light","water","nature"],"card_types":["クリーチャー"],"card_number":"DM25EX3 S7/S11","product_name":"DM25-EX3 邪神爆発デュエナマイトパック「王道W」"}
{"official_url":"https://dm.takaratomy.co.jp/card/detail/?id=dm25ex2-070","name":"聖霊王ノ裁キ","name_kana":"セイレイオウノサイキ","cost":5,"civilizations":["light"],"card_types":["呪文"],"card_number":"DM25EX2 70/105","product_name":"DM25-EX2 王道vs邪道 デュエキングWDreaM 2025"}
{"official_url":"https://dm.takaratomy.co.jp/card/detail/?id=dm25ex3-TD17","name":"新世界王の破壊","name_kana":"シンセカイオウノハカイ","cost":null,"civilizations":["water","darkness","nature","light","fire"],"card_types":["呪文","その他"],"card_number":"DM25EX3 TD17/TD23","product_name":"DM25-EX3 邪神爆発デュエナマイトパック「王道W」"}
```

注: DB の `name_kana` は機械由来の場合があり、ChatGPT が公式読みとして再利用してはならない。上例は構造提示であり、再収集時は公式掲載の有無を確認して未検証読みを null に戻す。画像は各例に `official/<URL id>` のキーが実在するが、入力スキーマには含めない。

## 12. NULL・欠損値ルール

必須キー省略・空文字は validation error。任意情報の公式非掲載は明示 `null`（配列は公式空欄が確認できたときのみ `[]`）。取得失敗・読み取れない値は推測/null にせずレコードを隔離してエラー。`cost:null` はコスト欄の公式空欄を確認した場合に限り、未知値と区別する確認記録を残す。`name_kana:null` は公式読み未確認で許容。DB の nullable と投入の受け入れ条件を混同しない。既存 builder の `coalesce` / 空配列維持は欠損を隠し得るため、先に明示検証する。

## 13. 推奨Import方式

JSONL は複数収録を行ごとに検証・差分報告でき、日本語/配列/null/記号を CSV より安全に保持する。JSON 配列でも可能だが大量再開には JSONL が適する。xlsx は人間の校閲用のみ。既存 crawler の `.local/dm-cards-full.jsonl` に近いが、**既存 full-catalogue builder/apply を小規模ファイルへ直結しない**。`validate-dm-card-import.mjs` は `card_text`, `effect_text`, `flavor_text`, `image`, `image_url`, `price` を拒否する。JSONL の各行は上記8キーに限定し、異常値を拒否する。

## 14. Codex側で今後実装すべき処理

未実装。schema validation（未知キー/重複ID/公式 URL・型・公式空欄と取得失敗の区別）→ 既存DBの生存/soft-deleted ID と canonical 名、ロック、商品、画像状況を読取 → dry-run の追加/更新/skip/error とフィールド差分 → ユーザー確認 → トランザクション内 upsert → 件数/ID/失敗理由ログ。canonical は `(game_id,name) WHERE deleted_at IS NULL`、print は `(official_card_id) WHERE official_card_id IS NOT NULL AND deleted_at IS NULL` を衝突対象とする。商品は別工程 `(game_id,product_code)`。ロック、異名同ID、NULLによる既存値上書き、複数 print 間の canonical 属性差異、soft-delete をエラー/明示審査へ。検索語・商品リンク・画像同期を別々に検証。権限を絞ったサーバー側処理とし、秘密鍵を ChatGPT データやログへ含めない。

## 15. 未確認事項

- 公式サイトの新規URLで、上記8項目すべてを安定取得できるか、特に読み/コストなし/複数面の個別表示は入力URLごとに確認が必要。現行 parser は読みを取得せず `null` とする。
- DB には種族・パワー・能力・フレーバー・レアリティ・イラストレーター列がない。これらを保存したいなら今回は対象外の別設計/DB変更が必要。
- 既存 canonical の同名 print 間で cost/文明/種類が異なると単一行に収まらない。現行 builder は名前で集約するため、投入前に差異を報告し、勝手に一方を採らない。
- 画像の公式利用条件、配信先 R2 の権限/現在のアップロード状況、商品ページの不確かな発売日（年月のみ/配布）は個別確認。URLから画像キーや日付を決め打ちしない。
- 本調査はライブDBの列・制約・Index・Trigger・関数名と抜粋実データを確認したが、全行品質・全 View/RPC の完全な動作検証・新規 import の dry-run は実施していない。
