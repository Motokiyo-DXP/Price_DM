import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {getInitialEditorSort,parseEditorSort,restoreEditorCards,sortDeckCards} from './deck-sorting.ts';
import {parseDeckInput} from './deck-validation.ts';
test('new and legacy defaults preserve intended order',()=>{
 assert.deepEqual(getInitialEditorSort(),{key:'cost',direction:'asc'});
 assert.deepEqual(getInitialEditorSort({}),{key:'saved',direction:'asc'});
});
test('each deck restores its own setting and rejects invalid values',()=>{
 for(const key of ['saved','cost','added','name','quantity']) for(const direction of ['asc','desc']) {
 const form=new FormData(); for(const [k,v] of Object.entries({name:'A',format:'original',visibility:'private',description:'',cards:'[]',editorSortKey:key,editorSortDirection:direction})) form.set(k,v);
 const parsed=parseDeckInput(form); assert.equal(parsed.editorSortKey,key);assert.equal(parsed.editorSortDirection,direction);
 assert.deepEqual(getInitialEditorSort(parsed),{key,direction});
 }
 assert.equal(parseEditorSort('bad','asc'),null);assert.equal(parseEditorSort('cost','bad'),null);
});
test('added descending survives repeated save and reopen',()=>{
 const cards=[{name:'A',quantity:1},{name:'B',quantity:1}];
 const saved=sortDeckCards(cards,'added','desc');
 assert.deepEqual(sortDeckCards(restoreEditorCards(saved,'added','desc'),'added','desc'),saved);
});
test('persistence is wired through form, actions, query and constrained migration',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 assert.ok(read('../components/deck-editor.tsx').includes('const [deckSortDirection, setDeckSortDirection] = useState<SortDirection>(initialSort.direction)'));
 for(const field of ['editorSortKey','editorSortDirection']) assert.ok(read('../components/deck-editor.tsx').includes(`name="${field}"`));
 for(const field of ['editor_sort_key','editor_sort_direction']) {assert.ok(read('../app/decks/actions.ts').includes(field));assert.ok(read('../app/decks/[id]/edit/page.tsx').includes(field));}
 const sql=read('../supabase/migrations/20261004182824_persist_deck_editor_sort.sql');assert.match(sql,/default 'saved'/);assert.match(sql,/check \(editor_sort_key in/);assert.match(sql,/check \(editor_sort_direction in/);
 for (const operation of ['select', 'insert', 'update']) assert.ok(sql.includes(`${operation} (editor_sort_key, editor_sort_direction)`));
 assert.ok(sql.includes('on public.decks to authenticated'));
 assert.ok(!sql.includes('to anon')); 
});
test('mobile result name reserves one line with ellipsis',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const rule=[...css.matchAll(/\.deck-result-card-name\{([^}]*)\}/g)].at(-1)[1];
 for(const style of ['display:block','white-space:nowrap','overflow:hidden','text-overflow:ellipsis','min-height:1.25em']) assert.ok(rule.includes(style));
 assert.ok(!rule.includes('clamp:2'));assert.ok(!rule.includes('min-height:2.5em'));
});
