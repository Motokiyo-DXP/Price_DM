import assert from 'node:assert/strict';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import {openSync,writeFileSync,mkdirSync} from 'node:fs';
import {createCardSearchDb,readMigration} from './test-support/card-search-db.mjs';
const url=new URL(process.env.PRICE_DM_RARITY_NATIVE_URL??'postgres://rarity_local@127.0.0.1:55482/postgres');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55482');assert.equal(url.username,'rarity_local');
assert.ok(process.env.PRICE_DM_POSTGREST_EXE,'Set PRICE_DM_POSTGREST_EXE to the official binary');
const admin=new pg.Client({connectionString:url.href});await admin.connect();
assert.ok((await admin.query("select current_setting('data_directory') as d")).rows[0].d.replaceAll('\\','/').endsWith('/rarity-filter-20261107/Price_DM/.local/rarity-native/pgdata'));
const name=`rarity_rest_${process.pid}`;await admin.query(`create database ${name}`);await admin.end();url.pathname='/'+name;
const client=new pg.Client({connectionString:url.href});await client.connect();
const db={exec:async sql=>{await client.query(sql);},query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
await createCardSearchDb(db);
await db.exec(`alter table card_products add column product_code text;
  create or replace function auth.uid() returns uuid language sql as $$ select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'),'')::uuid $$;
  do $$ begin create role rarity_authenticator noinherit login; exception when duplicate_object then null; end $$;
  grant anon,authenticated to rarity_authenticator;`);
await db.exec(readMigration('20261028040039_card_keyword_infix_search.sql'));
await db.exec(readMigration('20261108132726_card_print_rarity_filters.sql'));
await db.exec("update card_prints set rarity_codes=case id when 1 then '{C}'::text[] when 2 then '{SR}'::text[] when 3 then '{KGM}'::text[] end;");
const secret=randomBytes(48).toString('hex'),enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const data=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:'00000000-0000-0000-0000-000000000001',exp:Math.floor(Date.now()/1000)+3600});
const token=data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
mkdirSync('.local/rarity-native',{recursive:true});
const log=openSync('.local/rarity-native/postgrest.log','a');
const rest=spawn(process.env.PRICE_DM_POSTGREST_EXE,[],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,
  PGRST_DB_URI:`postgres://rarity_authenticator@127.0.0.1:55482/${name}`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55484',PGRST_JWT_SECRET:secret}});
async function rpc(body,authenticated=true) {
  const r=await fetch('http://127.0.0.1:55484/rpc/search_deck_cards_filtered',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
}
try {
  let ready=false;
  for(let attempt=0;attempt<100;attempt++) {
    if(rest.exitCode!==null)throw Error(`PostgREST exited ${rest.exitCode}; see local log`);
    try {const r=await fetch('http://127.0.0.1:55484/');if(r.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'PostgREST did not become ready');
  const old=await rpc({p_query:'ゲート'});assert.equal(old.status,200,JSON.stringify(old));assert.ok(old.body.length);
  const multi=await rpc({p_query:'',p_rarities:['C','KGM']});assert.equal(multi.status,200,JSON.stringify(multi));assert.deepEqual(multi.body.map(r=>r.id).sort(),[1,3]);
  const none=await rpc({p_rarities:[]});assert.equal(none.status,200);assert.ok(none.body.some(r=>r.id===4));
  const denied=await rpc({p_rarities:['C']},false);assert.ok([401,403].includes(denied.status));
  const report={database:name,postgres:(await db.query('select version() v')).rows[0].v,oldClient:'pass',rarityOverload:'pass',unknownUnfiltered:'pass',anonDenied:'pass'};
  writeFileSync('.local/rarity-native/postgrest-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {rest.kill();await client.end();}
