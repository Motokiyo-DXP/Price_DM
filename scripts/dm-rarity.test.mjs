import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeRarity,parseOfficialRarity,parseOfficialRarities,parseRarityOptions,reconcileRarities} from './dm-rarity.mjs';
import {buildRarityBackfill} from './build-dm-rarity-backfill.mjs';
test('official labels normalize without deriving SEC from secret print numbers',()=>{
  assert.equal(normalizeRarity(' ＳＲ '),'SR');assert.equal(normalizeRarity('レアリティなし'),'NONE');
  assert.equal(normalizeRarity('KGM'),'KGM');assert.equal(normalizeRarity(''),null);
  const face=r=>`<div class="cardDetail"><table><tr><th>レアリティ</th><td>${r}</td></tr></table></div>`;
  assert.equal(parseOfficialRarity('<h3>DM24EX4 ㊙7超/㊙10</h3>'+face('SR')),'SR');
  assert.equal(parseOfficialRarity(face('C')+face('C')),'C');
  assert.equal(parseOfficialRarity(face('SR')+face('-')),'SR');
  assert.equal(parseOfficialRarity(face('-')+face('R')),'R');
  assert.equal(parseOfficialRarity(face('-')), 'NONE');
  assert.equal(parseOfficialRarity(face('C')+face('SR')),null);
  assert.deepEqual(parseOfficialRarities(face('U')+face('VIC')),['U','VIC']);
  assert.equal(parseOfficialRarity(face('')),null);
  assert.deepEqual(parseRarityOptions('<select name="rarity"><option value="">指定なし</option><option value="k">KGM</option></select>'),[{value:'k',rarity:'KGM'}]);
});
test('reprints match only exact official ID and ambiguous or locked prints remain unresolved',()=>{
  const result=reconcileRarities([{id:1,official_card_id:'a'},{id:2,official_card_id:'b'},{id:3,official_card_id:'c'},{id:4,official_card_id:null},{id:5,official_card_id:'a',manually_locked:true}],
    [{official_card_id:'a',rarity:'C'},{official_card_id:'b',rarity:'SR'},{official_card_id:'b',rarity:'R'}]);
  assert.deepEqual(result.map(r=>r.rarity_codes),[['C'],null,null,null,null]);
  assert.deepEqual(result.slice(1).map(r=>r.reason),['conflicting_official_rarities','not_in_official_rarity_results','missing_official_id','manually_locked']);
});
test('backfill rejects unproven and duplicate identities',()=>{
  assert.throws(()=>buildRarityBackfill({total:1,verified:1,unverified:0,rows:[{id:1,rarity_codes:['SR']}]}),/evidence/);
});
