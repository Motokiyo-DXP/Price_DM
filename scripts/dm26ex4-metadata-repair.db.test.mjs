import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{spawnSync}from'node:child_process';
import{buildRepairSql}from'./build-dm26ex4-metadata-repair.mjs';
import{buildCompleteSql}from'./build-dm26ex4-complete.mjs';
import{normalizedTextArraySql}from'./build-dm26ex4-official-update.mjs';
const container=process.env.DM26EX4_LOCAL_CONTAINER;
if(!container||container!=='price-dm-ex4-repair-20261014')throw Error('Explicit isolated local validation container is required');
const baseline=JSON.parse(readFileSync(new URL('../docs/dm26ex4-baseline-20261014.json',import.meta.url),'utf8'));
const plan=JSON.parse(readFileSync(new URL('../docs/dm26ex4-repair/plan.json',import.meta.url),'utf8'));
function query(sql){const r=spawnSync('docker',['exec',container,'psql','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
test('real PostgreSQL diff equals the planned repair; every other field and ID is preserved',()=>{
 for(const [table,rows]of[['canonical_cards',baseline.cards],['card_prints',baseline.prints]]){
  const actual=JSON.parse(query(`select jsonb_agg(to_jsonb(t) order by id) from public.${table} t`));
  assert.equal(actual.length,rows.length);
  for(const before of rows){const row=actual.find(c=>c.id===before.id),change=plan.changes.find(c=>c.table===table&&c.id===before.id);const expected={...before,...change?.values,metadata_provenance:{...before.metadata_provenance,...change?.provenance}};delete expected.updated_at;delete row.updated_at;assert.deepEqual(row,expected,`${table}/${before.id}`);}
 }
});
test('existing search RPC filters repaired cost/civilization/type/race/text and numeric power',()=>{
 const auth="begin; set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000014'; ";
 const sql="select coalesce(jsonb_agg(id),'[]'::jsonb) from public.search_deck_cards_filtered(p_query=>'クサビタケノヌシ',p_min_cost=>3,p_max_cost=>3,p_civilizations=>array['nature'],p_card_types=>array['クリーチャー'],p_race_tokens=>array['ツチガミ'],p_card_text_query=>'マッハファイター');";
 assert.match(query(auth+sql+'rollback;'),/\[43965\]/u);
 assert.match(query(auth+"select coalesce(jsonb_agg(id),'[]'::jsonb) from public.search_deck_cards_filtered(p_query=>'クサビ＝護＝ノヌシ',p_min_power=>5000,p_max_power=>5000); rollback;"),/\[43963\]/u);
 assert.match(query(auth+"select coalesce(jsonb_agg(id),'[]'::jsonb) from public.search_deck_cards_filtered(p_query=>'クサビタケノヌシ',p_min_power=>2000,p_max_power=>2000); rollback;"),/\[\]/u);
});
test('changed backup aborts the whole repair transaction and retains concurrent work',()=>{
 const sql=readFileSync(new URL('./dm26ex4-metadata-repair.sql',import.meta.url),'utf8');
 const r=spawnSync('docker',['exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:"begin; update canonical_cards set cost=9 where id=43965;\n"+sql,encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Repair baseline changed: canonical_cards\/43965/u);
 assert.equal(query('select cost from canonical_cards where id=43965'), '3');
});
test('reapplying the real SQL changes no values or timestamps',()=>{
 const hash=()=>query("select md5((select jsonb_agg(to_jsonb(c) order by id)::text from canonical_cards c)||(select jsonb_agg(to_jsonb(p) order by id)::text from card_prints p)||(select jsonb_agg(to_jsonb(t) order by id)::text from card_search_terms t))");
 const before=hash(),r=spawnSync('docker',['exec',container,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-f','/tmp/repair.sql'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(hash(),before);
});
test('all preexisting search terms retain their exact IDs and contents; new readings are searchable',()=>{
 const before=JSON.parse(readFileSync(new URL('../docs/dm26ex4-repair/search-terms-baseline.json',import.meta.url),'utf8'));
 const after=JSON.parse(query('select jsonb_agg(to_jsonb(t) order by id) from card_search_terms t'));
 for(const row of before)assert.deepEqual(after.find(t=>t.id===row.id),row);
 assert.equal(after.length-before.length,41);
 const r=query("begin; set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000014'; select jsonb_agg(id) from public.search_deck_cards_filtered(p_query=>'むげんせんし ダンダリバン'); rollback;");
 assert.match(r,/\[44034\]/u);
});
test('Windows CRLF conversion cannot change embedded card text or break its source ownership',()=>{
 const value=["一行目\n二行目 ' 引用 \\ 記号"],change=plan.changes.find(c=>c.table==='card_prints');
 const generated=buildRepairSql({...plan,changes:[{...change,values:{card_texts:value}}],reading_terms:[]});
 const expression=generated.match(/card_texts=(array\(select jsonb_array_elements_text\(.+?\)\)::text\[\])/u)?.[1];
 assert.ok(expression);assert.deepEqual(JSON.parse(query(('select to_jsonb('+expression+')').replace(/\n/gu,'\r\n'))),value);
 const manifest=JSON.parse(readFileSync(new URL('./dm26ex4-complete.json',import.meta.url),'utf8'));
 const imported=buildCompleteSql(manifest).match(/set card_texts=(array\(select jsonb_array_elements_text\(.+?\)\)::text\[\])/u)?.[1];
 assert.ok(imported);assert.deepEqual(JSON.parse(query('select to_jsonb('+imported+')')),manifest.cards.find(c=>c.metadata?.card_texts).metadata.card_texts);
 assert.equal(query(`select ${normalizedTextArraySql('to_jsonb(t.card_texts)')} = ${normalizedTextArraySql("t.metadata_provenance->'card_texts'->'value'")} from card_prints t where id=48534`),'t');
});
