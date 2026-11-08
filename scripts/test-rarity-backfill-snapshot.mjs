// Copies only the read-only print identity snapshot into a private loopback test DB.
// Never accepts a hosted connection or applies the payload to Supabase.
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {buildRarityBackfill} from './build-dm-rarity-backfill.mjs';
const snapshot=JSON.parse(await readFile('.local/rarity-prints-before.json','utf8'));
const report=JSON.parse(await readFile('.local/rarity/reconciliation.json','utf8'));
assert.equal(snapshot.prints.length,report.total);
const url=new URL(process.env.PRICE_DM_RARITY_NATIVE_URL??'postgres://rarity_local@127.0.0.1:55482/postgres');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55482');assert.equal(url.username,'rarity_local');
const admin=new pg.Client({connectionString:url.href});await admin.connect();
assert.ok((await admin.query("select current_setting('data_directory') as d")).rows[0].d.replaceAll('\\','/').endsWith('/rarity-filter-20261107/Price_DM/.local/rarity-native/pgdata'));
const name=`rarity_snapshot_${process.pid}`;await admin.query(`create database ${name}`);await admin.end();url.pathname='/'+name;
const db=new pg.Client({connectionString:url.href});await db.connect();
try {
  await db.query(`create table tcg_games(id bigint primary key,slug text);insert into tcg_games values(1,'duel-masters');
    create table canonical_cards(id bigint primary key,game_id bigint);
    create table card_prints(id bigint primary key,canonical_card_id bigint,official_card_id text,card_number text,product_name text,manually_locked boolean,deleted_at timestamptz,rarity_codes text[],rarity_provenance jsonb);
    create index on card_prints using gin(rarity_codes) where deleted_at is null and rarity_codes is not null;`);
  await db.query(`insert into canonical_cards select distinct r.canonical_card_id,1 from jsonb_to_recordset($1::jsonb) r(canonical_card_id bigint)`,[JSON.stringify(snapshot.prints)]);
  await db.query(`insert into card_prints(id,canonical_card_id,official_card_id,card_number,product_name,manually_locked)
    select id,canonical_card_id,official_card_id,card_number,product_name,manually_locked from jsonb_to_recordset($1::jsonb)
    r(id bigint,canonical_card_id bigint,official_card_id text,card_number text,product_name text,manually_locked boolean)`,[JSON.stringify(snapshot.prints)]);
  const hash=async()=> (await db.query("select md5(string_agg((to_jsonb(p)-'rarity_codes'-'rarity_provenance')::text,'' order by id)) h from card_prints p")).rows[0].h;
  const baseline=await hash(),sql=buildRarityBackfill(report);
  await db.query(sql.apply);await db.query(sql.apply);
  assert.equal(await hash(),baseline);
  const counts=(await db.query('select count(*)::int total,count(rarity_codes)::int registered,count(*) filter(where rarity_codes is null)::int unverified from card_prints')).rows[0];
  assert.equal(counts.registered,report.verified);assert.equal(counts.unverified,report.unverified);
  const distribution=(await db.query('select rarity,count(*)::int count from card_prints cross join lateral unnest(rarity_codes) rarity group by rarity order by rarity')).rows;
  await db.query(sql.rollback);assert.equal((await db.query('select count(rarity_codes)::int n from card_prints')).rows[0].n,0);
  await db.query(sql.apply);assert.equal(await hash(),baseline);
  const result={scope:'Local PostgreSQL identity snapshot; not production registration',database:name,counts,reasons:report.reasons,distribution,
    checks:{apply:'pass',repeat:'pass',rollback:'pass',identityPreserved:'pass',finalLocalApply:'pass'}};
  await writeFile('.local/rarity/full-snapshot-test.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await db.end();}
