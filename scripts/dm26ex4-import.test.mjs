import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePreview,buildPreviewSql} from './build-dm26ex4-preview.mjs';
import {filterOfficialCards,buildReconciliationSql} from './build-dm26ex4-reconciliation.mjs';
import {buildDryRunSql} from './build-dm26ex4-dry-run.mjs';
const source=JSON.parse(await readFile(new URL('./dm26ex4-preview.json',import.meta.url),'utf8'));

test('48 documented provisional prints, unique numbers and no invented official IDs',()=>{
 const result=validatePreview(source);
 assert.equal(result.cards.length,48);
 assert.equal(new Set(result.cards.map(x=>x.dbNumber)).size,48);
 assert.equal(result.cards.find(x=>x.number==='99/99').name,'ビワ入道');
});
test('out-of-range numbers and a different set official ID are refused',()=>{
 const wrong=structuredClone(source); wrong.cards[0].card_number='100/99';
 assert.throws(()=>validatePreview(wrong),/Invalid printed/);
 assert.throws(()=>filterOfficialCards([{card_number:'DM26EX4 1/99',name:'A',official_url:'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-001'}]),/valid detail/);
});
test('dry-run is read-only and reports additions, reuse, duplicates and conflicts',()=>{
 const sql=buildDryRunSql(source);
 assert.doesNotMatch(sql,/\b(insert|update|delete|create|alter|drop|truncate|nextval)\b/iu);
 for(const key of ['canonical_add','canonical_reuse','print_add','print_duplicate','deferred','conflicts']) assert.ok(sql.includes(key));
});
test('unverified card source and fabricated card numbers fail closed',()=>{
 const wrong=structuredClone(source);wrong.cards[0].verified=true;
 assert.throws(()=>validatePreview(wrong),/Invalid/);
 const dup=structuredClone(source);dup.cards.push(dup.cards[0]);
 assert.throws(()=>validatePreview(dup),/Duplicate/);
 const unknown=structuredClone(source);unknown.cards[0].card_number='?/99';
 assert.throws(()=>validatePreview(unknown),/Invalid/);
});
test('SQL is transaction-scoped, provisional, non-overwriting, keyed by product and number',()=>{
 const sql=buildPreviewSql(source);
 assert.match(sql,/begin;[\s\S]*commit;/);
 assert.match(sql,/source_checked_at,product_id/);
 assert.match(sql,/null,null,p.id/);
 assert.match(sql,/on conflict\(game_id,normalized_name_nfkc\) where deleted_at is null do nothing/);
 assert.match(sql,/on conflict\(canonical_card_id,normalized_term,term_kind\) do nothing/);
 assert.match(sql,/'dmwiki',false,40/);
 assert.doesNotMatch(sql,/pg_catalog\.normalize\([^)]*,NFKC\)/);
 assert.match(sql,/on conflict\(game_id,product_code\) do nothing/);
 assert.doesNotMatch(sql,/\bdelete\s+from\b/);
});
test('only official detail URLs are accepted for reconciliation',()=>{
 assert.throws(()=>filterOfficialCards([{card_number:'DM26EX4 1/99',name:'test',official_url:'https://dmwiki.net/test?id=untrusted'}]),/valid detail/);
 const cards=filterOfficialCards([{card_number:'DM26EX4 1/99',name:'切札連結 「修羅」「黄金」「覇」',official_url:'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex4-001'}]);
 assert.equal(cards.length,1);
 const sql=buildReconciliationSql(cards);
 assert.match(sql,/p\.official_card_id is null and not p\.manually_locked/);
 assert.match(sql,/raise exception 'Official\/provisional mismatch/);
 assert.match(sql,/c\.manually_locked/);
 assert.doesNotMatch(sql,/pg_catalog\.normalize\([^)]*,NFKC\)/);
 assert.doesNotMatch(sql,/\bdelete\s+from\b/);
});
test('colliding official ids are refused',()=>{
 const first={card_number:'DM26EX4 1/99',name:'A',official_url:'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex4-001'};
 assert.throws(()=>filterOfficialCards([first,{...first,card_number:'DM26EX4 2/99'}]),/duplicate/);
});
