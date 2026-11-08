// Explicit loopback PostgreSQL fixture. No production credentials or real user data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import {validate,buildSql,bundle,sha} from './dm26ex5-images.mjs';
const archive=process.argv[2];
if(!archive)throw Error('Pass existing isolated EX5 official artifact directory');
const password=await fs.readFile(path.join(archive,'pg-password.txt'),'utf8');
const config={host:'127.0.0.1',port:55479,user:'ex5_local',password,options:'-c search_path=public,extensions'};
const admin=new pg.Client({...config,database:'postgres'});await admin.connect();
const target=(await admin.query("select current_user,inet_server_addr() as host,inet_server_port() as port,current_setting('data_directory') as dir")).rows[0];
assert.equal(target.current_user,'ex5_local');assert.equal(target.host,'127.0.0.1');assert.equal(target.port,55479);assert.equal(target.dir,path.resolve(archive,'pgdata').replaceAll('\\','/'));
const db='ex5_images_'+Date.now();await admin.query(`CREATE DATABASE ${db} TEMPLATE ex5_migration_probe_v8`);
const c=new pg.Client({...config,database:db});await c.connect();
const m=validate(JSON.parse(await fs.readFile(bundle+'/manifest.json','utf8'))),sql=await fs.readFile(bundle+'/apply.sql','utf8');assert.equal(sql,buildSql(m));
const results=[];const pass=name=>{results.push({name,status:'pass'});console.log('PASS '+name);};
const q=s=>c.query(s);
const hash=async()=>JSON.stringify((await q(`select 'canonical' as source,id::text,to_jsonb(t) as data from canonical_cards t union all select 'product',id::text,to_jsonb(t) from card_products t union all select 'print',id::text,to_jsonb(t) from card_prints t union all select 'search',id::text,to_jsonb(t) from card_search_terms t union all select 'deck',id::text,to_jsonb(t) from deck_cards t union all select 'price',id::text,to_jsonb(t) from price_records t order by source,id`)).rows);
try{
 await q('TRUNCATE canonical_cards,card_products CASCADE');
 await q('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text); INSERT INTO supabase_migrations.schema_migrations SELECT n::text FROM generate_series(1,181) n');
 await q("INSERT INTO card_products(id,game_id,product_code,product_name) OVERRIDING SYSTEM VALUE SELECT 268,id,'DM26-EX5','EX5 fixture' FROM tcg_games WHERE slug='duel-masters'");
 for(const r of [...new Map(m.rows.map(r=>[r.canonical_id,r])).values()])await c.query("INSERT INTO canonical_cards(id,game_id,name,source_name) OVERRIDING SYSTEM VALUE SELECT $1,id,$2,$2 FROM tcg_games WHERE slug='duel-masters'",[r.canonical_id,r.name]);
 for(const r of m.rows)await c.query('INSERT INTO card_prints(id,canonical_card_id,official_card_id,card_number,product_id) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5)',[r.print_id,r.canonical_id,r.official_id,r.number,r.product_id]);
 const cid=m.rows[0].canonical_id,pid=m.rows[0].print_id;
 await c.query("INSERT INTO card_prints(id,canonical_card_id,official_card_id,image_key) OVERRIDING SYSTEM VALUE VALUES(999999,$1,'dm26ex4-fixture','official/preserved-ex4')",[cid]);
 await q("INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-8000-0000000e5511','ex5-images@example.invalid'); INSERT INTO decks(id,owner_id,name) VALUES('00000000-0000-4000-8000-0000000e5512','00000000-0000-4000-8000-0000000e5511','image fixture'); INSERT INTO shops(name) VALUES('image fixture shop')");
 await c.query("INSERT INTO deck_cards(deck_id,canonical_card_id,card_print_id,quantity) VALUES('00000000-0000-4000-8000-0000000e5512',$1,$2,1)",[cid,pid]);
 await c.query("INSERT INTO price_records(shop_id,canonical_card_id,card_print_id,sale_price) SELECT id,$1,$2,1000 FROM shops WHERE name='image fixture shop'",[cid,pid]);
 await c.query("SELECT set_config('price_dm.release_project_ref','fxhlobydispnbywxhirn',false),set_config('price_dm.image_manifest_sha',$1,false)",[sha(JSON.stringify(m))]);
 const failure=async(name,statement)=>{const before=await hash();let err;try{await q(statement);}catch(e){err=e;}await q('ROLLBACK');assert.ok(err,name+' should reject');assert.equal(await hash(),before);pass(name);};
 await failure('forced error after updates rolls back all rows',sql.replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;'));
 await q(sql);assert.equal((await q("SELECT count(*)::int AS n FROM card_prints WHERE official_card_id LIKE 'dm26ex5-%' AND image_key IS NOT NULL")).rows[0].n,115);pass('initial apply: 115 official images; protected EX4/deck/price rows unchanged');
 const after=await hash();await q(sql);assert.equal(await hash(),after);pass('reapply: values and updated_at identical');
 const last=m.rows.at(-1);
 for(const [name,change,restore] of [
  ['print lock',`update card_prints set manually_locked=true where id=${last.print_id}`,`update card_prints set manually_locked=false where id=${last.print_id}`],
  ['canonical lock',`update canonical_cards set manually_locked=true where id=${last.canonical_id}`,`update canonical_cards set manually_locked=false where id=${last.canonical_id}`],
  ['print soft delete',`update card_prints set deleted_at=now() where id=${last.print_id}`,`update card_prints set deleted_at=null where id=${last.print_id}`],
  ['canonical soft delete',`update canonical_cards set deleted_at=now() where id=${last.canonical_id}`,`update canonical_cards set deleted_at=null where id=${last.canonical_id}`],
  ['existing image conflict',`update card_prints set image_key='preserve-me' where id=${last.print_id}`,`update card_prints set image_key='${last.image_key}' where id=${last.print_id}`],
  ['number conflict',`update card_prints set card_number='conflict' where id=${last.print_id}`,`update card_prints set card_number='${last.number}' where id=${last.print_id}`]
 ]){await q(change);await failure(name+' rejects full transaction',sql);await q(restore);}
 await q("DELETE FROM supabase_migrations.schema_migrations WHERE version='181'");await failure('migration drift rejected',sql);await q("INSERT INTO supabase_migrations.schema_migrations VALUES('181')");
 await q("SET price_dm.release_project_ref='wrong'");await failure('wrong release project rejected',sql);await q("SET price_dm.release_project_ref='fxhlobydispnbywxhirn'");
 const other=new pg.Client({...config,database:db});await other.connect();await other.query("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('price-dm-production-release',0))");await failure('concurrent release rejected',sql);await other.query('ROLLBACK');await other.end();
 const bad=structuredClone(m);bad.rows[0].official_id='signed-unknown';assert.throws(()=>validate(bad));pass('signed or nonofficial ID rejected');
 const bad2=structuredClone(m);bad2.rows[0].sha256='0'.repeat(64);assert.throws(()=>validate(bad2));pass('asset hash/key mismatch rejected');
 await fs.writeFile(bundle+'/db-test.json',JSON.stringify({database:db,scope:'PostgreSQL 17.11; existing 180-migration native template, synthetic 181 history, synthetic auth/card/deck/price fixtures; pg_cron omitted as in prior EX5 test',results},null,2)+'\n');
}finally{await c.end();await admin.end();}
