import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeNumber,parseWikiDetail,projectMetadata} from './dm26ex4-research.mjs';
import {buildCompleteSql,validateComplete} from './build-dm26ex4-complete.mjs';
import {buildOfficialUpdateSql,buildOfficialImageReplacementSql} from './build-dm26ex4-official-update.mjs';
import {canonicalMapping,canonicalName,mappings} from './dm26ex4-canonical-mappings.mjs';
const manifest=JSON.parse(readFileSync(new URL('./dm26ex4-complete.json',import.meta.url)));
for(const mapping of mappings)test(`audited ${mapping.number} reuses canonical ${mapping.canonical_id}`,()=>{
 const card=manifest.cards.find(c=>'DM26EX4 '+c.card_number===mapping.number);
 assert.equal(canonicalMapping(card).canonical_id,mapping.canonical_id);
 assert.equal(canonicalName(card),mapping.canonical_name);
 assert.throws(()=>canonicalMapping({...card,name:'別カード'}),/source name changed/u);
 assert.equal(canonicalName({...card,card_number:'99/99'}),card.name);
 assert.match(buildCompleteSql(manifest),new RegExp('id='+mapping.canonical_id));
});
test('printed secret notation and both physical faces are retained',()=>{
 assert.equal(normalizeNumber('㊙︎10b/㊙︎25'),'㊙10b/㊙25');assert.equal(normalizeNumber('16a/99'),'16a/99');
 for(const n of ['100/99','超51/超50','㊙26/㊙25','?/99','秘1/秘25'])assert.equal(normalizeNumber(n),null);
 assert.equal(manifest.cards.length,162);assert.equal(manifest.cards.filter(c=>c.image).length,159);
 for(const n of ['16a/99','16b/99','㊙10a/㊙25','㊙10b/㊙25'])assert.ok(manifest.cards.find(c=>c.card_number===n));
});
test('wiki observations distinguish infinity, unknown and no applicable power',()=>{
 const html='<div id="body"><h2>《試験／呪文》</h2><table class="style_table"><tr><td>試験　SR　火文明　(∞)</td></tr><tr><td>クリーチャー：ドラゴン　0000+</td></tr><tr><td>能力</td></tr><tr><td>呪文　R　水文明 （?）</td></tr><tr><td>呪文</td></tr><tr><td>別の能力</td></tr></table></div>';
 const r=parseWikiDetail(html,'試験／呪文','https://dmwiki.net/%E3%80%8Aexample');
 assert.equal(r.faces.length,2);assert.equal(r.faces[0].cost_is_infinite,true);
 assert.equal(r.faces[1].cost.status,'unavailable');assert.equal(r.faces[1].power.status,'not_applicable');
 assert.equal(r.faces[0].power_value,0);assert.deepEqual(projectMetadata(r).civilizations,['fire','water']);
 assert.equal(parseWikiDetail(html,'別カード','https://dmwiki.net/x').matched,false);
});
test('image identity and public proof are required before any image DB assignment',()=>{
 assert.equal(validateComplete(manifest),true);
 assert.doesNotMatch(buildCompleteSql(manifest),/set image_key=/u);
 const c=manifest.cards.find(c=>c.image),bad=structuredClone(manifest);bad.cards.find(x=>x.image).image.name='different';
 assert.throws(()=>validateComplete(bad),/image identity/u);
 assert.throws(()=>buildCompleteSql(manifest,[{key:c.image.key,status:404}]),/verification/u);
 const proof={key:c.image.key,status:200,sha256:c.image.sha256,decoded:true,url:`https://dm-price-tracker-card-images.tcg-price-checker.workers.dev/${c.image.key}.webp`};
 assert.throws(()=>buildCompleteSql(manifest,[proof,proof]),/Duplicate/u);
 const sql=buildCompleteSql(manifest,[proof]);assert.match(sql,/Existing image changed/u);assert.match(sql,/p.image_key is null/u);
});
test('provisional enrichment uses source ownership and protects official/manual fields',()=>{
 const sql=buildCompleteSql(manifest);
 assert.match(sql,/c.source_checked_at is null/u);assert.match(sql,/not c.manually_locked/u);
 assert.match(sql,/p.official_card_id is not null/u);assert.match(sql,/cardinality\(p.card_texts\)=0/u);
 assert.match(sql,/source_metadata.*dmwiki/u);assert.doesNotMatch(sql,/delete from|set name=/iu);
});
test('official upgrade preserves print IDs, skips unavailable fields, and rejects unowned edits',()=>{
 const sql=buildOfficialUpdateSql([{official_card_id:'dm26ex4-001',official_url:'https://dm.takaratomy.co.jp/card/detail/?id=dm26ex4-001',card_number:'DM26EX4 1/99',name:'カード',faces:[],fields:{cost:{status:'observed',value:5},power_text:{status:'unavailable'}}}]);
 assert.match(sql,/Unowned or manually edited field cost/u);assert.match(sql,/official_catalog/u);assert.doesNotMatch(sql,/set power_text|insert into public.card_prints/u);
 assert.throws(()=>buildOfficialUpdateSql([{fields:{}}]),/Invalid/u);
 assert.throws(()=>buildOfficialImageReplacementSql({printId:1}),/Invalid/u);
});
