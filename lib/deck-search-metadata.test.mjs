import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const deck = readFileSync(new URL('../components/deck-editor.tsx', import.meta.url), 'utf8');
const keyBody = deck.split('const currentSearchKey = JSON.stringify(')[1].split(');')[0];
const rpcBody = deck.split('const searchArgs = ')[1].split(';')[0];
const names = ['searchQuery','SEARCH_PAGE_SIZE','searchSort','searchSortDirection','productFilter','searchCardNumberFilter','civilizationFilter','civilizationMode','colorFilter','cardTypeFilter','minimumCost','maximumCost','minimumPower','maximumPower','selectedRaceTokens','cardTextQuery','includeNoCost','imageFilter','offset'];
const identity = new Function(...names, 'return '+keyBody);
const request = new Function(...names, 'return '+rpcBody);

test('filter changes share the same search identity and RPC values', () => {
  for (const [min,max,races,text] of [['','','',''],['6000','','ドラゴン',''],['','9000','','革命'],['6000','9000','コマンド,ドラゴン','革命 チェンジ']]) {
    const args = ['',24,'relevance','asc','', '', ['fire'],'cap','all','クリーチャー','5','8',min,max,races ? races.split(',') : [],text,false,'all',24];
    const key = identity(...args), rpc = request(...args);
    assert.deepEqual(key,{...rpc,p_offset:null});
    assert.equal(rpc.p_min_power,min ? Number(min) : null);
    assert.equal(rpc.p_max_power,max ? Number(max) : null);
    assert.deepEqual(rpc.p_race_tokens,args[14]);
    assert.equal(rpc.p_card_text_query,text || null);
  }
  const dependencies=deck.split('}, [searchQuery,')[1].split(']);')[0];
  for (const state of ['minimumPower','maximumPower','selectedRaceTokens','cardTextQuery']) assert.ok(dependencies.includes(state),state);
  assert.ok(deck.includes('}, [currentSearchKey, loadSearchPage]);'));
});

test('clear resets active and draft metadata filters', () => {
  const clear=deck.split('className="deck-filter-clear"')[1].split('全条件クリア')[0];
  for (const reset of ['setMinimumPower("")','setMaximumPower("")','setSelectedRaceTokens([])','setRaceDraftTokens([])','setRaceSearch("")','setCardTextQuery("")']) assert.ok(clear.includes(reset),reset);
});
