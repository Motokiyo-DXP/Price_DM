import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';

// Disposable PostgreSQL only: no linked project, credentials, or host port.
const container = `price-dm-metadata-test-${process.pid}`;
const serve = process.argv.includes('--serve');
const restContainer = `${container}-rest`;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
function sql(input) {
  return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input);
}
const setup = `
create role anon; create role authenticated;
create schema private; create schema auth; create schema extensions;
create extension pg_trgm with schema extensions;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create table tcg_games(id bigint primary key, slug text);
create table canonical_cards(id bigint primary key, game_id bigint, name text, name_kana text, cost integer, civilizations text[], card_types text[], races text[], power_value integer, deleted_at timestamptz);
create table card_products(id bigint primary key, release_date date);
create table card_prints(id bigint primary key, canonical_card_id bigint, product_id bigint, product_name text, card_number text, image_key text, card_texts text[], deleted_at timestamptz, card_number_search text generated always as (lower(card_number)) stored, product_name_search text generated always as (lower(product_name)) stored);
create index on card_prints(canonical_card_id) where deleted_at is null;
create table card_search_terms(canonical_card_id bigint, normalized_term text, term_kind text);
create table decks(id bigint primary key);
create table deck_cards(deck_id bigint, canonical_card_id bigint, quantity integer);
insert into tcg_games values(1,'duel-masters');
insert into canonical_cards values
 (1,1,'ボルシャックA','ぼるしゃっく',5,'{fire}','{クリーチャー}','{デーモン・コマンド・ドラゴン}',6000,null),
 (2,1,'ボルシャックB','ぼるしゃっく',8,'{fire,water}','{クリーチャー}','{アーマード・ドラゴン}',9000,null),
 (3,1,'ボルシャックC','ぼるしゃっく',3,'{water}','{呪文}','{デーモン・コマンド}',3000,null),
 (4,1,'ボルシャックD','ぼるしゃっく',null,'{fire}','{呪文}','{}',null,null);
insert into card_products values(1,'2020-01-01'),(2,'2024-01-01');
insert into card_prints values
 (1,1,1,'商品A','DM-A', 'one','{革命,スピードアタッカー}',null),
 (2,1,2,'商品B','DM-B', 'two','{チェンジ}',null),
 (3,2,2,'商品B','DM-C', 'three','{革命,チェンジ,スピードアタッカー}',null),
 (4,3,1,'商品A','DM-D',null,'{革命}',null),
 (5,3,1,'商品A','DM-E',null,'{チェンジ,削除限定}',now()),
 (6,4,1,'商品A','DM-F',null,null,null);
alter table card_prints add column official_card_id text;
insert into decks values(1);
insert into deck_cards values(1,1,4),(1,2,2);
`;
try {
  if (serve) docker(['network', 'create', container]);
  docker(['run', '-d', '--name', container, ...(serve ? ['--network', container, '--network-alias', 'db'] : []), '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17']);
  for (let attempt = 0; attempt < 40; attempt++) {
    const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
    if (ready.status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  sql(setup);
  sql(read('supabase/migrations/20260904145848_restore_nfkc_card_search_normalization.sql').split('delete from')[0]);
  sql(read('supabase/migrations/20260923161835_add_home_market_search_rpc.sql').split('-- Keep the fuzzy cutoff')[0]);
  sql(read('supabase/migrations/20260924185334_deck_market_search_first_response.sql'));
  sql(`insert into card_search_terms select id,normalize_card_search(name),'official_name' from canonical_cards;`);
  const ids = (args = '') => sql(`select coalesce(string_agg(id::text,',' order by ord),'') from search_deck_cards_filtered(${args}) with ordinality as s(id,name,name_kana,print_count,usage_count,representative_print_id,image_key,cost,civilizations,card_types,ord);`).trim();
  const cases = ['', "p_query=>'ボ'", "p_query=>'ボル'", "p_query=>'ボルシャック'", "p_sort=>'relevance',p_query=>'ボル'", "p_sort=>'usage',p_ascending=>true", "p_sort=>'name',p_ascending=>true", "p_sort=>'release_date',p_ascending=>true", "p_limit=>2,p_offset=>1", "p_product_name=>'商品B'", "p_card_number=>'DM-B'", "p_civilizations=>array['fire']", "p_civilizations=>array['fire','water'],p_civilization_mode=>'cap'", "p_civilizations=>array['fire','water'],p_civilization_mode=>'cup'", "p_color=>'single'", "p_color=>'multi'", "p_card_types=>array['呪文']", "p_min_cost=>5,p_max_cost=>8", "p_min_cost=>5,p_no_cost=>true", "p_image=>'with'", "p_image=>'without'"];
  const before = cases.map(ids);
  sql(read('supabase/migrations/20261004193830_deck_search_metadata_filters_release.sql'));
  assert.deepEqual(cases.map(ids), before, 'existing filters, ranking and pagination unchanged');
  const checks = [
    ["p_min_power=>6000",'1,2'], ["p_max_power=>6000",'1,3'], ["p_min_power=>4000,p_max_power=>8000",'1'],
    ["p_min_power=>0",'1,2,3'], ["p_min_power=>9000,p_max_power=>6000",''],
    ["p_race_tokens=>array['ドラゴン']",'1,2'], ["p_race_tokens=>array[]::text[]",before[0]], ["p_race_tokens=>array['デーモン・コマンド・ドラゴン']",'1'], ["p_race_tokens=>array['コマンド']",'1,3'], ["p_race_tokens=>array['コマンド','ドラゴン']",'1'],
    ["p_card_text_query=>'革命'",'1,2,3'], ["p_card_text_query=>''",before[0]], ["p_card_text_query=>'革命 チェンジ'",'1,2'], ["p_card_text_query=>'革命　チェンジ'",'1,2'], ["p_card_text_query=>'削除限定'",''],
    ["p_card_text_query=>'  ',p_race_tokens=>array[' '],p_min_power=>null,p_max_power=>null",before[0]],
    ["p_civilizations=>array['fire'],p_min_cost=>5,p_max_cost=>8,p_min_power=>6000,p_race_tokens=>array['ドラゴン'],p_card_text_query=>'スピードアタッカー'",'1,2'],
    ["p_race_tokens=>array['コマンド'],p_card_text_query=>'革命 チェンジ',p_min_power=>6000,p_limit=>1,p_offset=>1",''],
  ];
  for (const [args, expected] of checks) assert.equal(ids(args), expected, args);
  sql("alter table canonical_cards add column cost_is_infinite boolean not null default false; alter table canonical_cards add column power_text text; alter table card_products add column product_code text;");
  sql(read('supabase/migrations/20260914111514_deck_card_filters.sql').split('create function private.search_deck_cards_filtered_impl')[0]);
  const oldRangeResults = cases.map(ids);
  sql(read('supabase/migrations/20261010011417_deck_filter_races_and_infinite_ranges.sql'));
  assert.deepEqual(cases.map(ids), oldRangeResults, 'finite cards retain existing search results');
  for (const [args, expected] of checks) assert.equal(ids(args), expected, args);
  sql(`insert into canonical_cards(id,game_id,name,cost,cost_is_infinite,power_value,power_text,civilizations,card_types,races) values
    (5,1,'無限',null,true,null,'∞','{fire}','{クリーチャー}','{ロスト・クルセイダー,ロスト・クルセイダー・ドラゴン,ロスト・クルセイダー・ワード}');
    update card_products set product_code='DM-A' where id=1;`);
  const infiniteChecks = [
    ["p_min_cost=>99", '5'], ["p_max_cost=>99", '1,2,3'],
    ["p_min_cost=>99,p_max_cost=>100,p_no_cost=>true", '4'],
    ["p_min_cost=>99,p_no_cost=>true", '4,5'], ["p_max_cost=>0,p_no_cost=>true", '4'],
    ["p_min_power=>99999", '5'], ["p_max_power=>99999", '1,2,3'],
    ["p_min_power=>99999,p_max_power=>100000", ''],
    ["p_race_tokens=>array['ロスト','クルセイダー'],p_min_cost=>99,p_min_power=>99999,p_civilizations=>array['fire']", '5'],
  ];
  for (const [args, expected] of infiniteChecks) assert.equal(ids(args), expected, args);
  assert.ok(ids().split(',').includes('5'), 'no bounds include infinity');
  sql(`insert into tcg_games values(2,'other-game');
    insert into canonical_cards(id,game_id,name,races,deleted_at) values
      (6,2,'別ゲーム','{別ゲーム種族}',null), (7,1,'削除済','{削除種族}',now());`);
  assert.equal(sql(`select (deck_filter_options()->'races') = (
    select jsonb_agg(race order by race) from (select distinct unnest(c.races) race from canonical_cards c
    join tcg_games g on g.id=c.game_id where g.slug='duel-masters' and c.deleted_at is null) r
  );`).trim(), 't', 'all active duel-masters races, no extras');
  sql("update canonical_cards set races=array_append(races,'追加された新種族') where id=5;");
  assert.equal(sql("select (deck_filter_options()->'races') ? '追加された新種族';").trim(), 't');
  sql("delete from canonical_cards where id>=5;");
  console.log(`PASS: ${infiniteChecks.length} infinity/no-cost combinations and dynamic race completeness`);
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='search_deck_cards_filtered';").trim(),'1');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='search_deck_cards_filtered_fast_impl' and p.pronargs=19;").trim(),'1');
  sql("grant usage on schema private to authenticated;");
  const sessionChecks = sql("set role authenticated; select count(*) from search_deck_cards_filtered(p_min_power=>6000); reset role;");
  assert.ok(sessionChecks.includes('2'));
  sql("create or replace function auth.uid() returns uuid language sql as 'select null::uuid';");
  const denied = spawnSync('docker', ['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], {input:'select * from search_deck_cards_filtered();',encoding:'utf8'});
  assert.notEqual(denied.status,0); assert.match(denied.stderr,/Authentication required/);
  sql("create or replace function auth.uid() returns uuid language sql as 'select ''00000000-0000-0000-0000-000000000001''::uuid';");
  const idlePlan = spawnSync('docker', ['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], {
    input: "load 'auto_explain'; set auto_explain.log_min_duration=0; set auto_explain.log_analyze=on; set auto_explain.log_nested_statements=on; set client_min_messages=log; set plan_cache_mode=force_generic_plan; select count(*) from search_deck_cards_filtered(p_query=>'ボ');", encoding:'utf8', maxBuffer:8*1024*1024
  });
  assert.equal(idlePlan.status,0,idlePlan.stderr);
  assert.match(idlePlan.stderr,/Function Scan on unnest card_text[^\n]*\(never executed\)/, 'empty text must never scan card_texts even with a generic plan');
  const plan = sql("explain (analyze, buffers) select * from search_deck_cards_filtered(p_query=>'ボ');");
  console.log(`PASS: ${cases.length} existing search comparisons, ${checks.length} metadata cases, single public signature.\n${plan}`);
  if (serve) {
    sql(`grant usage on schema public, private to authenticated;
      grant select on all tables in schema public to authenticated;
      update canonical_cards set races=array_append(races,'ロスト・クルセイダー') where id=1;`);
    docker(['run', '-d', '--name', restContainer, '--network', container, '-p', '127.0.0.1:55441:3000', '-e', 'PGRST_DB_URI=postgres://postgres@db:5432/postgres', '-e', 'PGRST_DB_ANON_ROLE=authenticated', 'public.ecr.aws/supabase/postgrest:v16.4']);
    // Local fixture gateway only. There are no real accounts or credentials.
    const server = createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
        return res.end();
      }
      const headers = { ...req.headers }; delete headers.authorization; delete headers.host;
      const upstream = request({ hostname: '127.0.0.1', port: 55441, path: req.url.replace(/^\/rest\/v1/, ''), method: req.method, headers }, (reply) => {
        res.writeHead(reply.statusCode, { ...reply.headers, 'access-control-allow-origin': '*' }); reply.pipe(res);
      });
      upstream.on('error', (error) => { res.writeHead(502); res.end(error.message); });
      req.pipe(upstream);
    });
    server.listen(55442, '127.0.0.1', () => console.log('Local fixture PostgREST gateway: http://127.0.0.1:55442'));
    await new Promise((resolve) => {
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(resolve));
    });
  }
} finally {
  if (serve) docker(['rm', '-f', restContainer]);
  docker(['rm', '-f', container]);
  if (serve) docker(['network', 'rm', container]);
}
