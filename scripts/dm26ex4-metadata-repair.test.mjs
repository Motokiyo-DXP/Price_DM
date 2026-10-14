import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildRepairPlan,buildRepairSql,auditCompleteness} from './build-dm26ex4-metadata-repair.mjs';
import {parseWikiDetail,projectMetadata,summarizeMetadataAvailability} from './dm26ex4-research.mjs';
import {buildOfficialUpdateSql} from './build-dm26ex4-official-update.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const baseline=read('docs/dm26ex4-baseline-20261014.json'),research=read('docs/dm26ex4-repair/research.json'),observations=read('scripts/dm26ex4-image-observations.json'),manifest=read('scripts/dm26ex4-complete.json');
const plan=buildRepairPlan(baseline,research,observations,manifest);
test('identity-only imports are incomplete and can be retried even when SQL generation succeeds',()=>{
 const health=summarizeMetadataAvailability(manifest);
 assert.equal(health.status,'incomplete');assert.equal(health.detail_unavailable,41);
 assert.equal(health.image_unavailable,3);assert.ok(health.basic_field_unavailable>0);
 assert.ok(health.retry.some(c=>c.name==='クサビタケノヌシ'));
});
test('CLI fails the completeness gate and requires an explicit provisional exception',()=>{
 const dir=mkdtempSync(join(tmpdir(),'price-dm-ex4-health-')),out=join(dir,'candidate.sql');
 const args=[fileURLToPath(new URL('./build-dm26ex4-complete.mjs',import.meta.url)),fileURLToPath(new URL('./dm26ex4-complete.json',import.meta.url)),out];
 try{
  const blocked=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(blocked.status,2,blocked.stderr);
  const health=JSON.parse(readFileSync(out+'.availability.json','utf8'));assert.equal(health.detail_unavailable,41);
  const allowed=spawnSync(process.execPath,[...args,'--allow-incomplete'],{encoding:'utf8'});assert.equal(allowed.status,0,allowed.stderr);
 }finally{unlinkSync(out);unlinkSync(out+'.availability.json');rmdirSync(dir);}
});
test('all 41 incomplete basics and 5 annotated civilizations are detected and repaired',()=>{
 assert.equal(baseline.cards.filter(c=>auditCompleteness(c)==='unavailable_basic').length,41);
 assert.equal(plan.changes.filter(c=>c.table==='canonical_cards').length,46);
 assert.equal(plan.audits.filter(c=>c.after==='unavailable_basic').length,0);
 assert.equal(baseline.prints.filter(p=>!p.image_key).length,3);
 assert.ok(plan.changes.every(c=>!Object.hasOwn(c.values,'image_key')));
});
test('クサビタケノヌシ uses printed cost 3 and preserves special power notation',()=>{
 const c=plan.changes.find(c=>c.table==='canonical_cards'&&c.id===43965);
 assert.equal(c.values.cost,3);assert.deepEqual(c.values.civilizations,['nature']);
 assert.deepEqual(c.values.card_types,['クリーチャー']);assert.equal(c.values.power_text,'2000+');
 assert.equal(c.values.power_value,undefined);assert.equal(c.provenance.cost.verified,true);
 const p=plan.changes.find(c=>c.table==='card_prints'&&c.id===48521);
 assert.match(p.values.card_texts[0],/マッハファイター/u);
});
test('Jokers annotations are removed only from civilization tokens, unknown values stay unknown',()=>{
 const html=c=>`<div id="body"><h2>《試験》</h2><table class="style_table"><tr><td>試験　R　${c}　(3)</td></tr><tr><td>クリーチャー：ジョーカーズ　2000</td></tr><tr><td>能力</td></tr></table></div>`;
 for(const [c,v] of [['無色[ジョーカーズ]',['zero']],['水/闇文明[ジョーカーズ]',['water','darkness']]]){
  const r=parseWikiDetail(html(c),'試験','https://m.dmwiki.net/example');assert.deepEqual(projectMetadata(r).civilizations,v);
 }
 assert.deepEqual(projectMetadata(parseWikiDetail(html('不明[ジョーカーズ]'),'試験','url')).civilizations,[]);
});
test('unknown and not applicable costs are distinct and special cards are never automatic repair candidates',()=>{
 assert.equal(auditCompleteness({cost:null,card_types:['キング・セル']}),'special_cost_review');
 assert.equal(auditCompleteness({cost:null,card_types:['クリーチャー']}),'unavailable_cost');
 assert.equal(auditCompleteness({cost:null,cost_is_infinite:true,card_types:['クリーチャー']}),'infinite');
 assert.equal(auditCompleteness({cost:null,card_types:['キング・セル'],metadata_provenance:{cost:{status:'not_applicable'}}}),'not_applicable');
});
test('manual values and locks are preserved, conflicting values are review holds',()=>{
 const copy=structuredClone(baseline),card=copy.cards.find(c=>c.id===43965);card.cost=7;card.manually_locked=true;
 const result=buildRepairPlan(copy,research,observations,manifest);
 assert.ok(!result.changes.some(c=>c.table==='canonical_cards'&&c.id===43965));
 assert.ok(result.conflicts.some(c=>c.id===43965&&c.field==='cost'));assert.ok(result.holds.some(c=>c.id===43965));
});
test('SQL guards the exact backup and is idempotent; identifiers cannot expand the scope',()=>{
 const sql=buildRepairSql(plan);assert.match(sql,/Repair baseline changed/u);assert.match(sql,/lock_timeout='5s'/u);
 assert.doesNotMatch(sql,/delete from|insert into public\.(canonical_cards|card_prints)|set name=/iu);
 assert.equal(plan.reading_terms.length,41);assert.match(sql,/where not exists\(select 1 from public.card_search_terms/u);
 assert.throws(()=>buildRepairSql({...plan,changes:[{...plan.changes[0],table:'decks'}]}),/Unsafe/u);
});
test('twinpact retains both printed faces, second costs and text',()=>{
 const p=plan.changes.find(c=>c.table==='card_prints'&&c.before.canonical_card_id===43957);
 const faces=p.values.source_metadata.metadata_repair_20261014.faces;
 assert.equal(faces.length,2);assert.equal(faces[0].cost.value,6);assert.equal(faces[1].cost.value,3);
 assert.equal(p.values.card_texts.length,2);assert.deepEqual(faces[1].card_types.value,['呪文']);
});
test('5000BT missing printed Blocker is corrected only while the old wiki text is still source owned',()=>{
 const correction=plan.changes.find(c=>c.table==='card_prints'&&c.id===48526);
 assert.match(correction.values.card_texts[0],/ブロッカー/u);assert.equal(correction.provenance.card_texts.verified,true);
 const copy=structuredClone(baseline);copy.prints.find(p=>p.id===48526).card_texts=['手動編集'];
 const reviewed=buildRepairPlan(copy,research,observations,manifest);
 assert.ok(!reviewed.changes.some(c=>c.table==='card_prints'&&c.id===48526));
 assert.ok(reviewed.holds.some(c=>c.id===48526&&c.reason==='existing_text_ownership_changed'));
});
test('future official upgrades recognize checked product-image ownership and ignore only CRLF representation',()=>{
 const sql=buildOfficialUpdateSql([{official_card_id:'dm26ex4-fixture',official_url:'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex4-fixture',card_number:'DM26EX4 1/99',name:'テスト専用',faces:[],fields:{cost:{status:'observed',value:3},card_texts:{status:'observed',value:['一行\n二行']}}}]);
 assert.match(sql,/'dmwiki','official_product_image','official_catalog'/u);
 assert.match(sql,/chr\(13\)\|\|chr\(10\)/u);assert.match(sql,/Unowned or manually edited field/u);
});
