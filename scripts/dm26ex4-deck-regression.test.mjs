import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{sortDeckCards}from'../lib/deck-sorting.ts';
const baseline=JSON.parse(readFileSync(new URL('../docs/dm26ex4-baseline-20261014.json',import.meta.url),'utf8'));
const plan=JSON.parse(readFileSync(new URL('../docs/dm26ex4-repair/plan.json',import.meta.url),'utf8'));
test('クサビタケノヌシ cost 3 sorts between real cost 2 and twinpact cost 6 after save/reload data mapping',()=>{
 const ids=[43957,43965,43946],cards=ids.map(id=>{const c=baseline.cards.find(c=>c.id===id),delta=plan.changes.find(c=>c.table==='canonical_cards'&&c.id===id)?.values;return{...c,...delta,quantity:1};});
 const reloaded=JSON.parse(JSON.stringify(cards));
 assert.deepEqual(sortDeckCards(reloaded,'cost','asc').map(c=>c.id),[43946,43965,43957]);
 assert.deepEqual(sortDeckCards(reloaded,'cost','desc').map(c=>c.id),[43957,43965,43946]);
 assert.equal(baseline.prints.find(p=>p.id===48521).canonical_card_id,43965);
});
