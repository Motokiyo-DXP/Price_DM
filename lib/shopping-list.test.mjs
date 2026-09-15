import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildShoppingListGroups } from "./shopping-list.ts";

const cards = [{ id: 10, name: "カードA", imageUrl: "/a.webp" }];
const record = (overrides = {}) => ({ canonicalCardId: 10, shopId: 1, shopName: "店舗A", salePrice: 300, buyPrice: 100, cardPrintId: null, observedOn: "2026-09-05", createdAt: "2026-09-05T00:00:00Z", id: 1, ...overrides });

test("販売価格は店舗ごとの最新値から安い2店舗へ分類し最安・平均を返す", () => {
  const groups = buildShoppingListGroups(cards, [
    record({ id: 1, salePrice: 100, observedOn: "2026-09-01" }),
    record({ id: 2, salePrice: 300, observedOn: "2026-09-05" }),
    record({ id: 3, shopId: 2, shopName: "店舗B", salePrice: 200 }),
    record({ id: 4, shopId: 3, shopName: "店舗C", salePrice: 400 }),
  ], "sale");
  assert.deepEqual(groups.map((group) => group.shopName), ["店舗A", "店舗B"]);
  const entries = groups.flatMap((group) => group.entries);
  assert.equal(entries.find((entry) => entry.rank === 1)?.price, 200);
  assert.equal(entries.find((entry) => entry.rank === 1)?.minimumPrice, 200);
  assert.equal(entries.find((entry) => entry.rank === 1)?.averagePrice, 300);
});

test("カード共通価格があれば収録別価格を混在させない", () => {
  const groups = buildShoppingListGroups(cards, [
    record({ id: 1, shopId: 1, salePrice: 500, cardPrintId: null }),
    record({ id: 2, shopId: 2, shopName: "収録別だけの店", salePrice: 100, cardPrintId: 88 }),
  ], "sale");
  assert.deepEqual(groups.map((group) => group.shopName), ["店舗A"]);
});

test("買取価格は既存詳細画面と同じく高い店を優先し最安値と平均も保持する", () => {
  const groups = buildShoppingListGroups(cards, [
    record({ id: 1, shopId: 1, buyPrice: 100 }),
    record({ id: 2, shopId: 2, shopName: "店舗B", buyPrice: 300 }),
    record({ id: 3, shopId: 3, shopName: "店舗C", buyPrice: 200 }),
  ], "buy");
  const entries = groups.flatMap((group) => group.entries);
  assert.equal(entries.find((entry) => entry.rank === 1)?.price, 300);
  assert.equal(entries[0].minimumPrice, 100);
  assert.equal(entries[0].averagePrice, 200);
});

test("ブックマーク表は認証ユーザー本人だけに公開される", () => {
  const migration = fs.readFileSync("supabase/migrations/20260904164036_add_account_card_bookmarks_and_shopping_list.sql", "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to authenticated[\s\S]*auth\.uid\(\)[\s\S]*user_id/i);
  assert.match(migration, /revoke all[\s\S]*from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]+to anon/i);
});

test("相場一覧は旧お気に入り絞り込みを廃止し添付カート素材で買い物リストへ遷移する", () => {
  const source = fs.readFileSync("components/market-list.tsx", "utf8");
  assert.doesNotMatch(source, /気になるカードだけ表示|onlyFavorites/);
  assert.match(source, /href="\/shopping-list"/);
  assert.match(source, /カートのアイコン素材\.svg/);
  assert.match(source, /account_card_bookmarks/);
});

test("ブックマークは認証確認中を未ログイン扱いせず検証済みユーザーを使う", () => {
  const source = fs.readFileSync("components/market-list.tsx", "utf8");
  assert.match(source, /useState<string \| null \| undefined>\(undefined\)/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /favoriteUserId === undefined/);
  assert.doesNotMatch(source, /supabase\.auth\.getClaims\(\)/);
});
test("買い物リスト表示は汎用header CSSと競合せずスマホではアイコン表示になる", () => {
  const marketSource = fs.readFileSync("components/market-list.tsx", "utf8");
  const viewSource = fs.readFileSync("components/shopping-list-view.tsx", "utf8");
  const css = fs.readFileSync("app/globals.css", "utf8");
  assert.doesNotMatch(marketSource, /`n`n/);
  assert.match(marketSource, /aria-label="買い物リストを開く"/);
  assert.doesNotMatch(viewSource, /<header className="shopping-list-heading">/);
  assert.match(css, /@media\(max-width:620px\)\{\.market-shopping-link\{[^}]*flex:0 0 52px[^}]*\}\.market-shopping-link span\{display:none\}/);
});


test("販売・買取切り替えの下で次点カードの表示を切り替えられる", () => {
  const source = fs.readFileSync("components/shopping-list-view.tsx", "utf8");
  const css = fs.readFileSync("app/globals.css", "utf8");
  assert.match(source, /showSecondChoices/);
  assert.match(source, /aria-pressed=\{showSecondChoices\}/);
  assert.match(source, /次点を表示/);
  assert.match(source, /shopping-switch-track/);
  assert.match(source, /showSecondChoices \|\| entry\.rank === 1/);
  assert.match(css, /\.shopping-list-controls\{display:grid;gap:8px\}/);
  assert.match(css, /\.shopping-second-toggle/);
  assert.match(css, /\.shopping-second-toggle\[aria-pressed=true\] \.shopping-switch-thumb/);
});
test("価格の右側の星ボタンからブックマークを解除できる", () => {
  const source = fs.readFileSync("components/shopping-list-view.tsx", "utf8");
  const css = fs.readFileSync("app/globals.css", "utf8");
  assert.match(source, /className="shopping-remove-bookmark"/);
  assert.match(source, /<span aria-hidden="true">★<\/span><\/button>/);
  assert.match(source, /account_card_bookmarks"\)\.delete\(\)\.eq\("canonical_card_id", id\)/);
  assert.match(source, /setRemovedCardIds/);
  assert.match(source, /<article className="shopping-card shopping-card-priced">/);
  assert.match(css, /\.shopping-remove-bookmark\{/);
  assert.match(css, /\.shopping-list-page \.shopping-card-priced,\.shopping-list-page \.shopping-card-unpriced\{grid-template-columns:70px minmax\(0,1fr\) 44px/);
  assert.match(css, /\.shopping-card-priced \.shopping-remove-bookmark,\.shopping-card-unpriced \.shopping-remove-bookmark\{[^}]*grid-column:3/);
  assert.match(source, /<article className="shopping-card shopping-card-unpriced">/);
  assert.match(source, /<UnpricedShoppingCard card=\{card\} key=\{card\.id\} onRemove=/);
});
test("店舗取得では存在しないdeleted_at列を参照しない", () => {
  const source = fs.readFileSync("app/shopping-list/page.tsx", "utf8");
  const shopsQuery = source.match(/supabase\.from\("shops"\)[^;]+/u)?.[0] ?? "";
  assert.ok(shopsQuery);
  assert.doesNotMatch(shopsQuery, /deleted_at/u);
});

test("買い物リストのカード全体が詳細リンクとなり画像全体を表示する", () => {
  const source = fs.readFileSync("components/shopping-list-view.tsx", "utf8");
  const css = fs.readFileSync("app/globals.css", "utf8");
  assert.match(source, /className="shopping-card-detail-link" href=\{`\/cards\/\$\{entry\.id\}`\}/u);
  assert.doesNotMatch(source, />詳細<\/Link>/u);
  assert.match(css, /\.shopping-card\{[^}]*background:#2d2d2d/u);
  assert.match(css, /\.shopping-card \.card-artwork img\{[^}]*object-fit:contain/u);
  assert.match(css, /\.shopping-store>h2\{[^}]*font-size:clamp\(18px,3\.5vw,27px\)/u);
});

