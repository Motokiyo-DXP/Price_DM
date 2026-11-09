import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCardSearchDb,readMigration} from './test-support/card-search-db.mjs';
import {buildRarityBackfill} from './build-dm-rarity-backfill.mjs';
let native;
if(process.env.PRICE_DM_RARITY_NATIVE_URL) {
  const {default:pg}=await import('pg');
  const url=new URL(process.env.PRICE_DM_RARITY_NATIVE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55482');assert.equal(url.username,'rarity_local');
  const admin=new pg.Client({connectionString:url.href});await admin.connect();
  const info=(await admin.query("select current_setting('data_directory') as directory")).rows[0];
  assert.ok(info.directory.replaceAll('\\','/').endsWith('/rarity-filter-20261107/Price_DM/.local/rarity-native/pgdata'));
  const name=`rarity_search_${process.pid}`;await admin.query(`create database ${name}`);await admin.end();
  url.pathname='/'+name;native=new pg.Client({connectionString:url.href});await native.connect();
}
const db=await createCardSearchDb(native?{exec:async sql=>{await native.query(sql);},query:(sql,args)=>native.query(sql,args),close:()=>native.end()}:undefined);
const migration=readMigration('20261108132726_card_print_rarity_filters.sql');
try {
  await db.exec(readMigration('20261028040039_card_keyword_infix_search.sql'));
  await db.exec(`alter table card_prints add column manually_locked boolean default false;
    alter table card_products add column product_code text;
    alter table canonical_cards add column manually_locked boolean default false;
    insert into canonical_cards(id,game_id,name,cost,cost_is_infinite,civilizations,card_types,races)
      values (7,1,'コストなし',null,false,'{zero}','{呪文}','{}'),(8,1,'コスト0',0,false,'{zero}','{呪文}','{}'),(9,1,'無限',null,true,'{zero}','{呪文}','{}');`);
  // Transactional rollback and repeat application preserve original rows/ACL.
  const fingerprint=async()=>JSON.stringify((await db.query('select id,name,cost from canonical_cards order by id')).rows);
  const before=await fingerprint();
  await db.exec('begin;'+migration+'rollback;');
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='card_prints' and column_name='rarity_codes'")).rows[0].n,0);
  await db.exec(migration);await db.exec(migration);assert.equal(await fingerprint(),before);
  await db.exec(`    create function public.deck_filter_options() returns jsonb language sql security invoker as $$ select private.deck_filter_options_impl() $$;
    grant execute on function public.deck_filter_options() to authenticated;
`);
  await db.exec(`update card_prints set rarity_codes=case id when 1 then '{C}'::text[] when 2 then '{SR}'::text[] when 3 then '{KGM}'::text[] end;
    insert into card_prints(id,canonical_card_id,product_name,card_number,rarity_codes) values(10,1,'商品B','DM-09 9','{SR}'),(11,4,'商品B','DM-03 4','{U,VIC}');`);
  const query=async(args='')=>(await db.query(`select id from search_deck_cards_filtered(p_rarities:='{}'::text[]${args})`)).rows.map(r=>Number(r.id));
  await assert.rejects(()=>query());
  await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; set role authenticated;");
  assert.deepEqual((await db.query("select id from search_deck_cards_filtered(p_rarities:='{C,KGM}',p_sort:='name') order by id")).rows.map(r=>Number(r.id)),[1,3]);
  assert.deepEqual((await db.query("select id from search_deck_cards_filtered(p_rarities:='{SR}',p_product_name:='商品A')")).rows.map(r=>Number(r.id)),[2]);
  assert.deepEqual((await db.query("select id from search_deck_cards_filtered(p_rarities:='{SR}',p_product_name:='商品A',p_card_number:='DM-01 1')")).rows,[]);
  const all=await query();for(const id of [4,7,8,9])assert.ok(all.includes(id),'unfiltered includes unknown rarity / cost');
  for(const args of [',p_min_cost:=0',',p_max_cost:=6',',p_min_cost:=0,p_max_cost:=6']) {
    const ids=await query(args);assert.ok(!ids.includes(7));assert.ok(ids.includes(8));
  }
  assert.ok((await query(',p_min_cost:=0')).includes(9));assert.ok(!(await query(',p_max_cost:=6')).includes(9));
  assert.ok(!(await query(',p_min_cost:=0,p_no_cost:=true')).includes(7),'deprecated flag cannot include NULL in range');
  assert.deepEqual(await query(",p_query:='ゲート ヘブンズ'"),[3,999]);
  assert.deepEqual(await query(",p_min_power:=4000,p_race_tokens:='{テスト}',p_civilizations:='{water}'"),[4]);
  assert.deepEqual(await query(",p_card_text_query:='ブロッカー',p_card_types:='{呪文}',p_color:='single',p_civilizations:='{light}'"),[1,3]);
  for(const sort of ['relevance','name','release_date','usage'])assert.ok((await query(`,p_sort:='${sort}'`)).length>0);
  const options=(await db.query('select deck_filter_options() as value')).rows[0].value;
  assert.deepEqual(options.rarities,['C','KGM','SR','U','VIC']);
  for (const rarity of ['U','VIC'])assert.deepEqual((await db.query("select id from search_deck_cards_filtered(p_rarities:=$1::text[])",[[rarity]])).rows.map(r=>Number(r.id)),[4]);
  await db.exec('reset role;');
  // Backfill applies exactly once, repeated application does not rewrite, rollback restores NULL.
  await db.exec("update card_prints set official_card_id='fixture-'||id; update card_prints set rarity_codes=null;");
  const rows=(await db.query('select id,canonical_card_id,official_card_id,card_number,product_name from card_prints order by id')).rows
    .map(r=>({...r,id:Number(r.id),canonical_card_id:Number(r.canonical_card_id),rarity_codes:['SR'],evidence:{official_card_id:r.official_card_id,rarity:'SR',sha256:'fixture',body:'rarity=s',url:'fixture',checked_at:'2026-11-08'}}));
  const sql=buildRarityBackfill({total:rows.length,verified:rows.length,unverified:0,rows});
  await db.exec(sql.apply);await db.exec(sql.apply);
  await db.exec("update card_prints set manually_locked=true where id=1");
  await assert.rejects(()=>db.exec(sql.rollback));await db.exec('rollback;update card_prints set manually_locked=false where id=1;');
  await db.exec(sql.rollback);assert.equal((await db.query('select count(*)::int n from card_prints where rarity_codes is not null')).rows[0].n,0);
  await db.exec(readFileSync(new URL('../docs/rarity/rollback-search.sql',import.meta.url),'utf8'));
  await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
  assert.ok((await db.query("select id from search_deck_cards_filtered(p_min_cost:=0,p_no_cost:=true)")).rows.some(r=>Number(r.id)===7));
  await db.exec(migration);
  console.log('PASS: migration apply/repeat/rollback, authentication, same-print AND, rarity OR, NULL/0/infinite boundaries, legacy flag, keyword AND, metadata, sorts, options, conditional backfill/repeat/rollback/lock conflict');
} finally {await db.close();}
