// Real project migrations with one explicitly missing pg_cron migration and synthetic service bootstrap.
import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('.local/dm26ex5-official'),bin=path.join(root,'postgres/pgsql/bin/psql.exe');
const env={...process.env,PGPASSWORD:await readFile(path.join(root,'pg-password.txt'),'utf8'),PGOPTIONS:'-c search_path=public,extensions'};
function run(db,sql,fail=false){const r=spawnSync(bin,['-X','-h','127.0.0.1','-p','55479','-U','ex5_local','-v','ON_ERROR_STOP=1','-d',db,'-At'],{input:sql,encoding:'utf8',env,maxBuffer:20*1024*1024});if(!fail&&r.status!==0)throw Error(r.stderr);return r;}
const dir=path.join(root,'pgdata').replaceAll('\\','/');const server=run('postgres',"select current_user,inet_server_addr(),inet_server_port(),current_setting('data_directory'),version();").stdout.trim();
if(!server.startsWith(`ex5_local|127.0.0.1|55479|${dir}|PostgreSQL 17.`))throw Error('wrong server');
const report=JSON.parse(await readFile(path.join(root,'native-migration-probe.json'),'utf8'));
if(report.database!=='ex5_migration_probe_v8'||report.applied_count!==180||report.failures.length!==1)throw Error('migration probe changed');
const db='ex5_release_guard_test_v3';if(run('postgres',`select 1 from pg_database where datname='${db}';`).stdout.trim())throw Error('fixture already exists');
run('postgres',`create database ${db} template ex5_migration_probe_v8;`);
run(db,'truncate table public.canonical_cards cascade;');
run(db,"create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text); insert into supabase_migrations.schema_migrations select n::text from generate_series(1,181) n;");
const stage=JSON.parse(await readFile(path.join(root,'rehearsal-stage.json'),'utf8'));
const names=JSON.stringify(stage.rows.map(r=>r.canonical_name)).replaceAll("'","''");
const found=JSON.parse(run(db,`select coalesce(jsonb_agg(jsonb_build_object('name',c.name,'id',c.id)),'[]'::jsonb) from canonical_cards c where c.game_id=(select id from tcg_games where slug='duel-masters') and c.name in (select jsonb_array_elements_text('${names}'::jsonb));`).stdout.trim());
const replacements=new Map();
for(const row of stage.rows){const existing=found.find(x=>x.name===row.canonical_name);if(existing)replacements.set(row.canonical_id,9000000+row.canonical_id);}
// The template contains migration seed rows with unrelated generated IDs.
// Rename only these synthetic fixture rows before the test baseline; retain IDs
// and references, and never modify them during the import under test.
if(found.length)run(db,`update canonical_cards set name=name||' [fixture seed]' where id in (${found.map(x=>Number(x.id)).join(',')});`);
const rows=stage.rows.map(r=>({...r,canonical_id:replacements.get(r.canonical_id)??r.canonical_id}));
const raw=JSON.stringify(rows).replaceAll("'","''");
run(db,`insert into canonical_cards(id,game_id,name,source_name,cost,cost_is_infinite,civilizations,card_types,races,power_text,power_value) overriding system value select distinct r.canonical_id,g.id,r.canonical_name,r.canonical_name,r.cost,r.cost_is_infinite,r.civilizations,r.card_types,r.races,r.power_text,r.power_value from jsonb_to_recordset('${raw}'::jsonb) r(canonical_id bigint,canonical_name text,cost smallint,cost_is_infinite boolean,civilizations text[],card_types text[],races text[],power_text text,power_value integer) cross join tcg_games g where g.slug='duel-masters' and not exists(select 1 from canonical_cards c where c.game_id=g.id and c.name=r.canonical_name);
select setval(pg_get_serial_sequence('canonical_cards','id'),(select max(id) from canonical_cards),true);
insert into card_prints(canonical_card_id,official_card_id,official_url,card_number) values (44080,'dm26ex4-078','https://dm.takaratomy.co.jp/card/detail/?id=dm26ex4-078','DM26EX4 78/99'),(9163,'dm22-001','https://dm.takaratomy.co.jp/card/detail/?id=dm22-001','DM22 1/55'),(17848,'dm19-s03','https://dm.takaratomy.co.jp/card/detail/?id=dm19-s03','DM19 S3/S10');`);
let reuse=await readFile(path.join(root,'rehearsal.sql'),'utf8');reuse=reuse.replaceAll('ex5_rehearsal_v11',db).replace(/"canonical_id":(\d+),/g,(all,id)=>replacements.has(Number(id))?`"canonical_id":${replacements.get(Number(id))},`:all);
let create=(await readFile(path.join(root,'new-create-rehearsal.sql'),'utf8')).replaceAll('ex5_create_v3',db);
const hash=()=>run(db,"select md5((select coalesce(string_agg(row_to_json(t)::text,'|' order by id),'') from canonical_cards t)||(select coalesce(string_agg(row_to_json(t)::text,'|' order by id),'') from card_prints t)||(select coalesce(string_agg(row_to_json(t)::text,'|' order by id),'') from card_products t)||(select coalesce(string_agg(row_to_json(t)::text,'|' order by id),'') from card_search_terms t));").stdout.trim();
let out=[];const check=(name,ok)=>{if(!ok)throw Error(name);out.push({name,status:'pass'});};
const combined="SET price_dm.release_project_ref='fxhlobydispnbywxhirn'; SET price_dm.release_candidate='DM26-EX5-115';\n"+(await readFile(path.join(root,'../dm26ex5-production-payload.sql'),'utf8'));
let before=hash();check('all 115 forced rollback',run(db,combined.replace(/COMMIT;\s*$/,'select 1/0; commit;'),true).status!==0&&hash()===before);
run(db,combined);check('115 official prints present',run(db,"select count(*) from card_prints where official_card_id like 'dm26ex5-%';").stdout.trim()==='115');before=hash();check('production wrapper rejects repeat',run(db,combined,true).status!==0&&hash()===before);
const result={scope:'180/181 project migrations; synthetic auth/realtime/storage and synthetic card fixtures; no PostgREST, pg_cron omitted',database:db,synthetic_id_remappings:Object.fromEntries(replacements),results:out};await writeFile(path.join(root,'production-guard-test.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
