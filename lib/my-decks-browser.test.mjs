import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const browser = readFileSync(new URL("../components/my-decks-browser.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/decks/actions.ts", import.meta.url), "utf8");
const decksPage = readFileSync(new URL("../app/decks/page.tsx", import.meta.url), "utf8");
const publicSearch = readFileSync(new URL("../components/public-deck-search.tsx", import.meta.url), "utf8");
const publicSearchPage = readFileSync(new URL("../app/deck-search/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260913000000_remove_deck_popular_sort.sql", import.meta.url), "utf8");

function actionSource(name, nextName) {
  const start = actions.indexOf(`export async function ${name}`);
  const end = nextName ? actions.indexOf(`export async function ${nextName}`, start) : actions.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return actions.slice(start, end);
}

test("マイデッキの型・UI・Server Actionから人気順を削除する", () => {
  assert.doesNotMatch(`${browser}\n${actions}\n${decksPage}`, /popular|popularityScore/);
  assert.match(browser, /DeckListSortMode = "user" \| "newest"/);
  assert.match(decksPage, /deck_list_sort_mode==="newest"\?"newest":"user"/);
  assert.match(actions, /new Set\(\["user", "newest"\]\)/);
});

test("公開デッキ検索には人気順を残す", () => {
  assert.match(publicSearch, /"popular"/);
  assert.match(publicSearch, /popularityScore/);
  assert.match(publicSearchPage, /popularityScore/);
});

test("人気順の保存値をuserへ変換し制約をuserとnewestだけにする", () => {
  assert.match(migration, /set deck_list_sort_mode = 'user'[\s\S]*where deck_list_sort_mode = 'popular'/);
  assert.match(migration, /drop constraint if exists profiles_deck_list_sort_mode_check/);
  assert.match(migration, /array\['user'::text, 'newest'::text\]/);
  assert.doesNotMatch(migration.match(/add constraint[\s\S]*/)?.[0] ?? "", /popular/);
});

test("フォルダ名変更と削除は所有者を絞り所有行が返ったことを確認する", () => {
  const rename = actionSource("renameDeckFolderAction", "deleteDeckFolderAction");
  const remove = actionSource("deleteDeckFolderAction", "setDeckListSortAction");
  for (const source of [rename, remove]) {
    assert.match(source, /\.eq\("id", folderId\)[\s\S]*\.eq\("owner_id", auth\.userId\)/);
    assert.match(source, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
    assert.match(source, /if \(!data\) return \{ status: "error"/);
  }
  assert.match(rename, /const normalizedName = name\.trim\(\)/);
  assert.match(rename, /normalizedName\.length < 1 \|\| normalizedName\.length > 60/);
  assert.match(actions, /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/);
});

test("通常クリックではcaptureせず、成立した長押しだけcaptureしてclickを抑止する", () => {
  const begin = browser.slice(browser.indexOf("function beginLongPress"), browser.indexOf("function moveLongPress"));
  const end = browser.slice(browser.indexOf("function endLongPress"), browser.indexOf("function cancelLongPress"));
  const cancel = browser.slice(browser.indexOf("function cancelLongPress"), browser.indexOf("function changeSortMode"));
  assert.ok(begin.indexOf("setTimeout") < begin.indexOf("setPointerCapture"));
  assert.match(begin, /if\(dragRef\.current!==pending\)return/);
  assert.ok(end.indexOf("suppressClickUntilRef.current") < end.indexOf("if(!current.changed)return"));
  assert.match(end, /releasePointerCapture\(current\)/);
  assert.match(cancel, /releasePointerCapture\(current\)/);
});

test("フォルダ操作は枠なしの三点リーダーから変更モーダルへ集約する", () => {
  assert.match(browser, /<div className="deck-folder-heading"><button[\s\S]*className="deck-folder-toggle"[\s\S]*className="deck-folder-actions"/);
  assert.match(browser, /aria-label={`\$\{group.name\}の操作を開く`} className="deck-folder-more"[\s\S]*type="button">…<\/button>/);
  assert.doesNotMatch(browser, /deck-folder-rename|deck-folder-delete/);
  assert.match(styles, /\.deck-folder-more\{[^}]*background:transparent;[^}]*border:0;[^}]*min-height:44px;[^}]*min-width:48px/);
  assert.match(browser, /event\.key==="Escape"/);
  assert.doesNotMatch(browser, />長押し</);
  assert.match(browser, /const\[name,setName\]=useState\(dialog\.folder\.name\)/);
  assert.match(browser, /name="name" onChange=\{event=>setName\(event\.target\.value\)\} required value=\{name\}/);
  assert.match(browser, /<strong id="deck-folder-dialog-title">フォルダ名を変更<\/strong><\/header>/);
  assert.doesNotMatch(browser, /deck-folder-dialog-title[^\n]*aria-label="閉じる"/);
  const dialogActions = browser.slice(browser.indexOf('className="deck-folder-dialog-actions"'), browser.indexOf('</div></form>{error?'));
  assert.ok(dialogActions.indexOf('className="danger"') < dialogActions.indexOf('className="secondary"'));
  assert.ok(dialogActions.indexOf('className="secondary"') < dialogActions.indexOf('className="primary"'));
  assert.match(dialogActions, /"削除"/);
  assert.match(dialogActions, />キャンセル<\/button>/);
  assert.match(dialogActions, /"変更"/);
  assert.match(browser, /formAction=\{deleteFormAction\} formNoValidate/);
});

test("通常スワイプは慣性スクロールに渡し、長押し移動は離した位置も判定する", () => {
  assert.match(styles, /\.deck-folder-heading\{touch-action:pan-y\}/);
  assert.match(styles, /\.deck-folder-group \.my-deck-row\.can-reorder\{touch-action:pan-y\}/);
  assert.doesNotMatch(browser, /window\.scrollBy/);
  assert.match(browser, /if\(dragRef\.current\?\.active\)event\.preventDefault\(\)/);
  assert.match(browser, /if\(current\.active\)moveLongPress\(event\);dragRef\.current=null/);
});

test("デッキ本体・アイコン・鉛筆編集・歯車メニューは別の操作先を持つ", () => {
  assert.match(browser, /onClick=\{\(\)=>\{if\(Date\.now\(\)>=suppressClickUntilRef\.current\)setPreviewDeck\(deck\)/);
  assert.match(browser, /<DeckPreviewModal deckId=\{previewDeck\.id\}/);
  assert.match(browser, /className="my-deck-edit" href=\{`\/decks\/\$\{deck\.id\}\/edit`\}/);
  assert.doesNotMatch(browser, /<Link href=\{`\/decks\/\$\{selected\.id\}\/edit`\}>/);
  assert.match(browser, /aria-label=\{`\$\{deck\.name\}のアイコンを変更`\}[^>]*onClick=\{event=>\{event\.stopPropagation\(\);/);
  assert.match(browser, /className="my-deck-more" onClick=\{event=>\{event\.stopPropagation\(\);setSelected\(deck\);/);
  assert.match(browser, /className="ui-icon ui-icon-settings"\/><\/button>/);
  assert.match(styles, /\.ui-icon-settings\{[^}]*mask-image:url\('\/icons\/settings\.svg'\)/);
  assert.doesNotMatch(browser, /type="button">・・・<\/button>/);
  assert.doesNotMatch(browser, /アイコン変更<\/button>/);
  assert.match(styles, /\.my-decks-browser \.deck-action-grid\{gap:4px;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);padding:10px 8px\}/);
});

test("デッキ操作ポップアップから名前だけ変更できる", () => {
  assert.match(browser, /<DeckNameEditor deck=\{selected\}/);
  assert.match(browser, /aria-label=\{`\$\{deck\.name\}の名前を変更`\}/);
  assert.match(browser, /<input aria-label="デッキ名" autoFocus maxLength=\{60\}/);
  assert.match(browser, /if\(result\.status==="success"\)\{onRename\(deck\.id,normalizedName\);setEditing\(false\);\}else setError\(result\.message\)/);
  const rename = actionSource("renameDeckAction", "deleteDeckAction");
  assert.match(rename, /\.update\(\{ name: name\.trim\(\), updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(rename, /\.eq\("owner_id", auth\.userId\)/);
  assert.match(rename, /\.select\("id"\)\s*\.maybeSingle\(\)/);
  assert.match(rename, /if \(!data\) return \{ status: "error"/);
});
