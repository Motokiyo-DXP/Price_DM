import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import pg from 'pg';
import { createCardSearchDb, readMigration } from './test-support/card-search-db.mjs';
import { createShopSearchDb } from './test-support/shop-search-db.mjs';

// Disposable loopback-only PostgreSQL. No production URL or credential is accepted.
const base = new URL(process.env.PRICE_DM_NATIVE_TEST_URL ?? 'postgres://postgres@127.0.0.1:55472/postgres');
assert.equal(base.hostname,'127.0.0.1'); assert.equal(base.port,'55472');
const database=`price_dm_search_release_${process.pid}`;
const admin=new pg.Client({connectionString:base.href});await admin.connect();
await admin.query(`create database ${database}`);await admin.end();base.pathname='/'+database;
const client=new pg.Client({connectionString:base.href});await client.connect();
const db={exec:async(sql)=>{await client.query(sql);},query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
await createCardSearchDb(db);await createShopSearchDb(db);
await db.exec(`alter table tcg_games add column created_at timestamptz default now();
 do $$ begin create role authenticator noinherit login; exception when duplicate_object then null; end $$; grant anon,authenticated to authenticator;
 create or replace function auth.uid() returns uuid language sql as $$
 select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'),'')::uuid $$;
 insert into canonical_cards(id,game_id,name,cost,civilizations,card_types,races,power_value)
 select 10000+n,1,'無関係検証カード'||n,3,'{fire}','{呪文}','{}',null from generate_series(1,24000)n;
 insert into card_search_terms(canonical_card_id,normalized_term,term_kind) select id,normalize_card_search(name),'official_name' from canonical_cards where id>10000;
 insert into shops(id,name,name_kana,aliases,prefecture,municipality)
 select 10000+n,'カードショップ検証'||n,'カードショップケンショウ'||n,array['検証別名'],'東京都','検証市' from generate_series(1,3000)n;
 analyze canonical_cards;analyze card_search_terms;analyze shops;`);
const integrity=async()=> (await db.query(`select
 (select md5(string_agg(md5(to_jsonb(c)::text),'' order by id)) from canonical_cards c) cards,
 (select md5(string_agg(md5(to_jsonb(c)::text),'' order by id)) from card_prints c) prints,
 (select md5(string_agg(md5(to_jsonb(c)::text),'' order by id)) from card_search_terms c) terms,
 (select md5(string_agg(md5((to_jsonb(c)-'search_document')::text),'' order by id)) from shops c) shops`)).rows[0];
const beforeIntegrity=await integrity();
const acl=async()=> (await db.query("select n.nspname,p.proname,p.proacl::text,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('search_shops','search_shops_page','search_shops_by_prefecture','search_market_cards','search_registration_cards','search_canonical_cards','search_deck_cards_filtered','search_deck_cards_filtered_fast_impl') order by 1,2")).rows;
const beforeAcl=await acl();
async function measure(){const result={};await db.exec('set role anon');for(const q of ['ゲ','ヘブンズ','ゲート','ゲート ヘブンズ']){const times=[];let count;for(let i=0;i<6;i++){const t=performance.now();const rows=await db.query("select id from search_market_cards($1,'duel-masters',100,'broad')",[q]);count=rows.rows.length;if(i)times.push(performance.now()-t);}result[q]={medianMs:+times.sort((a,b)=>a-b)[2].toFixed(2),count};}for(const q of ['PAO','PAO 町田']){const times=[];for(let i=0;i<6;i++){const t=performance.now();await db.query('select * from search_shops_page($1,null,20,0)',[q]);if(i)times.push(performance.now()-t);}result[q]={medianMs:+times.sort((a,b)=>a-b)[2].toFixed(2)};}await db.exec('reset role');return result;}
const performanceBefore=await measure();
const migrationNames=['20261027015613_shop_keyword_and_search.sql','20261028040039_card_keyword_infix_search.sql'];
for(const name of migrationNames)await db.exec('begin;'+readMigration(name)+'commit;');
assert.deepEqual(await integrity(),beforeIntegrity,'original rows preserved by both migrations');
assert.deepEqual(await acl(),beforeAcl,'existing EXECUTE ACL and invoker/definer modes preserved');
const performanceAfter=await measure();
await db.exec(`insert into canonical_cards(id,game_id,name,cost_is_infinite,power_text,civilizations,card_types,races) values(7,1,'無限検証',true,'∞','{light}','{呪文}','{}');
 insert into card_search_terms(canonical_card_id,normalized_term,term_kind) values(7,normalize_card_search('無限検証'),'official_name');
 insert into canonical_cards(id,game_id,name,cost,civilizations,card_types,races) select 100+n,1,'ゲート前方候補'||lpad(n::text,3,'0'),3,'{fire}','{呪文}','{}' from generate_series(1,120)n;
 insert into card_search_terms(canonical_card_id,normalized_term,term_kind) select id,normalize_card_search(name),'official_name' from canonical_cards where id>100 and id<999;
 insert into shops(id,name,prefecture,municipality) select 500+n,'PAO追加候補'||n,'東京都','町田市' from generate_series(1,40)n;`);
const secret=randomBytes(48).toString('hex');
const jwt=(role,sub)=>{const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const data=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,...(sub?{sub}:{}),exp:Math.floor(Date.now()/1000)+7200});return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');};
const authToken=jwt('authenticated','00000000-0000-0000-0000-000000000001');
mkdirSync('.local/release',{recursive:true});
const executable=process.env.PRICE_DM_POSTGREST_EXE;assert.ok(executable,'Set PRICE_DM_POSTGREST_EXE to the official PostgREST binary');
const rest=spawn(executable,[],{windowsHide:true,env:{...process.env,PGRST_DB_URI:`postgres://authenticator@127.0.0.1:55472/${database}`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55473',PGRST_JWT_SECRET:secret}});
rest.stderr.on('data',data=>writeFileSync('.local/release/postgrest.log',data,{flag:'a'}));
async function rpc(name,args,token){const start=performance.now();const response=await fetch(`http://127.0.0.1:55473/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(args)});const body=await response.json();return {status:response.status,body,ms:performance.now()-start};}
const ids=r=>r.body.map(row=>Number(row.id));
try {
 for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:55473/');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const token of [undefined,authToken]){
  const shop=async(q,pref=null,offset=0,limit=100)=>rpc('search_shops_page',{p_query:q,p_prefecture:pref,p_limit:limit,p_offset:offset},token);
  const normal=await shop('PAO 町田');assert.equal(normal.status,200);assert.deepEqual(ids(normal),ids(await shop('町田 PAO')));assert.deepEqual(ids(normal),ids(await shop('ＰＡＯ　町田')));assert.equal(normal.body.length,41);
  assert.deepEqual(ids(await shop('竜星 横浜')),[1]);assert.deepEqual(ids(await shop('PAO 町田','神奈川県')),[]);
  const shopPages=[];for(let offset=0;offset<60;offset+=20){const r=await shop('PAO 町田','東京都',offset,20);shopPages.push(...ids(r));assert.ok(r.body.every(s=>Number(s.total_count)===41));}assert.equal(new Set(shopPages).size,41);
  for(const name of ['search_market_cards_page','search_registration_cards_page']){
   for(const q of ['ゲート ヘブンズ','ヘブンズ　ゲート','ヘブンズ ゲート']){const r=await rpc(name,{p_query:q,p_game_slug:'duel-masters',p_limit:100,p_offset:0},token);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(ids(r),[3]);}
   const size=name.includes('market')?100:30;const all=[];for(let offset=0;offset<200;offset+=size){const r=await rpc(name,{p_query:'ゲート',p_game_slug:'duel-masters',p_limit:size,p_offset:offset},token);assert.equal(r.status,200);all.push(...ids(r));if(r.body.length<size)break;}assert.equal(new Set(all).size,124);assert.ok(all.includes(3));
   assert.deepEqual(ids(await rpc(name,{p_query:'ゲ',p_game_slug:'duel-masters',p_limit:100},token)).filter(id=>id<100),[1,2]);
   assert.deepEqual(ids(await rpc(name,{p_query:'存在しない文字列',p_game_slug:'duel-masters'},token)),[]);
  }
 }
 const baseArgs={p_query:'ゲート',p_sort:'relevance',p_ascending:true};
 assert.equal((await rpc('search_deck_cards_filtered',baseArgs)).status,401);
 assert.equal((await rpc('search_deck_cards_filtered',baseArgs,'invalid.jwt.value')).status,401);
 const filtered=await rpc('search_deck_cards_filtered',{...baseArgs,p_civilizations:['water'],p_card_types:['クリーチャー'],p_min_power:4000,p_race_tokens:['テスト種族']},authToken);assert.equal(filtered.status,200,JSON.stringify(filtered.body));assert.deepEqual(ids(filtered),[4]);
 assert.deepEqual(ids(await rpc('search_deck_cards_filtered',{...baseArgs,p_min_cost:6,p_card_text_query:'ブロッカー',p_product_name:'天門商品',p_card_number:'DM-02',p_image:'with'},authToken)),[3]);
 for(const ascending of [true,false]){const rows=[];for(let offset=0;offset<150;offset+=24){const r=await rpc('search_deck_cards_filtered',{...baseArgs,p_ascending:ascending,p_limit:24,p_offset:offset},authToken);assert.equal(r.status,200);rows.push(...ids(r));if(r.body.length<24)break;}assert.equal(new Set(rows).size,125);assert.ok(rows.includes(3));}
 assert.deepEqual(ids(await rpc('search_deck_cards_filtered',{p_query:'無限',p_min_cost:99,p_min_power:99999},authToken)),[7]);
 assert.deepEqual(ids(await rpc('search_deck_cards_filtered',{p_query:'無限',p_max_cost:99},authToken)),[]);
 assert.deepEqual(ids(await rpc('search_deck_cards_filtered',{p_query:'無限',p_max_power:99999},authToken)),[]);
 // Restore original function definitions on the disposable DB, proving scoped recovery SQL compiles.
 const backupFile=process.env.PRICE_DM_SCOPED_BACKUP;
 if(backupFile){const backup=JSON.parse(readFileSync(backupFile,'utf8')).rows[0].backup;await db.exec('do $$ begin create role service_role; exception when duplicate_object then null; end $$;');for(const f of backup.functions)await db.exec(f.definition);await db.exec('alter table shops drop column search_document;drop function public.shop_search_document(text,text,text[],text);');assert.equal((await db.query("select count(*)::integer n from search_shops_page('PAO 町田',null,100,0)")).rows[0].n,0);}
 const summary={postgres:(await db.query('select version()')).rows[0].version,postgrest:'16.4',migrations:migrationNames,integrity:'unchanged original rows',acl:'unchanged',rpc:'anonymous and valid signed JWT; invalid JWT and anonymous deck denied',cardPages:124,shopPages:41,infiniteFilters:'preserved',recovery:backupFile?'original production functions restored on disposable database':'not requested',performanceBefore,performanceAfter};
 writeFileSync('.local/release/native-verification.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
} finally {rest.kill();await client.end();}
