import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createCardSearchDb,readMigration} from './test-support/card-search-db.mjs';
const root='.local/rarity-release';
const backup=JSON.parse(await readFile(`${root}/private-definitions-before.json`,'utf8'));
const columns=JSON.parse(await readFile(`${root}/print-columns.json`,'utf8'));
const manifest=JSON.parse(await readFile('docs/releases/rarity-20261109/manifest.json','utf8'));
const url=new URL('postgres://rarity_local@127.0.0.1:55482/postgres');
const admin=new pg.Client({connectionString:url.href});await admin.connect();
assert.ok((await admin.query("select current_setting('data_directory') d")).rows[0].d.replaceAll('\\','/').endsWith('/rarity-filter-20261107/Price_DM/.local/rarity-native/pgdata'));
const database=`rarity_exact_release_${process.pid}`;await admin.query(`create database ${database}`);await admin.end();url.pathname='/'+database;
const client=new pg.Client({connectionString:url.href});await client.connect();
const db={exec:async sql=>{await client.query(sql);},query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
try {
 await createCardSearchDb(db);await db.exec(readMigration('20261028040039_card_keyword_infix_search.sql'));
 await db.exec(`set timezone='UTC';drop table public.card_prints cascade;
   create table public.card_prints(${columns.map(c=>`"${c.name}" ${c.type}`).join(',')},primary key(id));
   alter table card_products add column product_code text;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);`);
 await db.query('insert into supabase_migrations.schema_migrations select unnest($1::text[])',[backup.history]);
 let restored=0;
 for(const file of (await readdir(`${root}/print-backup`)).sort()) {
   const rows=JSON.parse(await readFile(`${root}/print-backup/${file}`,'utf8'));
   await db.query('insert into card_prints select * from jsonb_populate_recordset(null::card_prints,$1::jsonb)',[JSON.stringify(rows)]);restored+=rows.length;
 }
 const hash=async()=> (await db.query("select md5(string_agg((to_jsonb(p)-'rarity_codes'-'rarity_provenance')::text,'' order by id)) h from card_prints p")).rows[0].h;
 assert.equal(restored,manifest.expected_prints);assert.equal(await hash(),backup.prints_hash,'full production print backup restores exactly');
 for(const f of [...backup.functions].sort((a,b)=>Number(b.signature.startsWith('private.'))-Number(a.signature.startsWith('private.'))))await db.exec(f.definition);
 const defs=async()=> (await db.query("select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace) and p.proname in ('deck_filter_options','deck_filter_options_impl','search_deck_cards_filtered','search_deck_cards_filtered_fast_impl','search_deck_cards_filtered_paged_impl','search_deck_cards_filtered_impl') order by 1")).rows;
 const beforeDefs=await defs();
 const migration=readMigration('20261108132726_card_print_rarity_filters.sql');
 await db.exec('begin;'+migration+'commit;');
 await db.query('insert into supabase_migrations.schema_migrations values($1)',[manifest.migration_version]);
 assert.equal(await hash(),backup.prints_hash);
 const apply=await readFile('docs/releases/rarity-20261109/apply.sql','utf8'),rollback=await readFile('docs/releases/rarity-20261109/rollback-data.sql','utf8');
 await db.exec(apply);await db.exec(apply);assert.equal(await hash(),backup.prints_hash);
 const counts=(await db.query('select count(*)::int total,count(rarity_codes)::int registered,count(*) filter(where rarity_codes is null)::int unverified from card_prints')).rows[0];
 assert.deepEqual(counts,{total:23751,registered:23746,unverified:5});
 const id=manifest.groups[0].ids[0];await db.query('update card_prints set manually_locked=true where id=$1',[id]);
 await assert.rejects(()=>db.exec(rollback));await db.exec('rollback;');await db.query('update card_prints set manually_locked=false where id=$1',[id]);
 await db.exec(rollback);assert.equal((await db.query('select count(rarity_codes)::int n from card_prints')).rows[0].n,0);
 await db.exec(await readFile('docs/rarity/rollback-search.sql','utf8'));
 // The real pre-release definitions are also restored, independently of repo SQL.
 for(const f of [...backup.functions].sort((a,b)=>Number(b.signature.startsWith('private.'))-Number(a.signature.startsWith('private.'))))await db.exec(f.definition);
 assert.deepEqual(await defs(),beforeDefs);assert.equal(await hash(),backup.prints_hash);
 await db.exec(migration);await db.exec(apply);
 const report={scope:'Native PostgreSQL 17; full production card_prints backup, no hosted mutation',database,restored_prints:restored,counts,
   checks:{fullBackupRestore:'pass',exactMigration:'pass',exactApply:'pass',repeat:'pass',rollback:'pass',manualLockConflict:'pass',realFunctionRestore:'pass',protectedPrintsHash:'pass',reapply:'pass'}};
 await writeFile('docs/releases/rarity-20261109/exact-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await client.end();}
