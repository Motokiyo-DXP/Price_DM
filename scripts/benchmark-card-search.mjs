import { createCardSearchDb, readMigration } from './test-support/card-search-db.mjs';
const db=await createCardSearchDb();
try {
  await db.exec(`insert into canonical_cards(id,game_id,name) select 10000+n,1,'無関係検証カード'||n from generate_series(1,24000)n;
    insert into card_search_terms(canonical_card_id,normalized_term,term_kind) select id,normalize_card_search(name),'official_name' from canonical_cards where id>10000;
    analyze canonical_cards;analyze card_search_terms;set role anon;`);
  async function measure(){const result={};for(const q of ['ゲ','ヘブ','ゲート','ヘブンズ','ゲート ヘブンズ','存在しない文字列']){const times=[];let count=0;for(let i=0;i<6;i++){const start=performance.now();const rows=await db.query("select id from search_market_cards($1,'duel-masters',100,'broad')",[q]);count=rows.rows.length;if(i)times.push(performance.now()-start);}result[q]={medianMs:Number(times.sort((a,b)=>a-b)[2].toFixed(1)),count};}return result;}
  const before=await measure();await db.exec('reset role');await db.exec(readMigration('20261028040039_card_keyword_infix_search.sql'));await db.exec('set role anon');const after=await measure();
  console.log(JSON.stringify({rows:24007,before,after},null,2));
}finally{await db.close();}
