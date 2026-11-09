import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const local='.local/rarity-release',out='docs/releases/rarity-20261109';
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const report=await read(`${local}/reconciliation.json`),fresh=await read(`${local}/fresh-print-identities.json`),backup=await read(`${local}/private-definitions-before.json`);
assert.equal(report.total,fresh.prints.length);assert.equal(backup.history.length,181);
assert.equal(backup.history.at(-1),'20261028040039');
const byId=new Map(fresh.prints.map(p=>[p.id,p]));
const fields=['id','canonical_card_id','official_card_id','card_number','product_name','manually_locked'];
for(const row of report.rows)for(const key of fields)assert.deepEqual(row[key],byId.get(row.id)?.[key],`Snapshot drift: ${row.id} ${key}`);
const groups=new Map();
for(const row of report.rows.filter(r=>r.rarity_codes && !r.reason)) {
  assert.ok(row.evidence?.sha256 && !row.manually_locked);
  const provenance={source:row.evidence.body==='detail'?'official_detail':'official_rarity_search',url:row.evidence.url,body:row.evidence.body,sha256:row.evidence.sha256,checked_at:row.evidence.checked_at,official_card_id:undefined};
  const value={codes:row.rarity_codes,provenance};
  const key=JSON.stringify(value);const group=groups.get(key)??{...value,ids:[]};group.ids.push(row.id);groups.set(key,group);
}
const manifest={project_ref:'fxhlobydispnbywxhirn',snapshot_at:fresh.checked_at,source_snapshot_at:report.snapshot_at,
  expected_prints:report.total,verified:report.verified,unverified:report.unverified,
  migration_version:'20261108132726',expected_migration_count:182,protected_prints_hash:backup.prints_hash,
  canonical_hash:backup.canonical_hash,unverified_rows:report.rows.filter(r=>r.reason),groups:[...groups.values()]};
assert.equal(manifest.groups.reduce((n,g)=>n+g.ids.length,0),manifest.verified);
const literal=JSON.stringify(manifest.groups).replaceAll("'","''");
const stage=`create temporary table rarity_release_stage on commit drop as
 select ids.id,g.codes,g.provenance || jsonb_build_object('official_card_id',p.official_card_id) as provenance
 from jsonb_to_recordset('${literal}'::jsonb) g(codes text[],provenance jsonb,ids bigint[])
 cross join lateral unnest(g.ids) as ids(id) join public.card_prints p on p.id=ids.id;
 alter table rarity_release_stage add primary key(id);
 analyze rarity_release_stage;`;
const prefix=`begin;\nset local lock_timeout='5s';\nset local statement_timeout='120s';
do $$ begin
 if not pg_try_advisory_xact_lock(hashtextextended('price-dm-production-release',0)) then raise exception 'Another release holds the lock'; end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>${manifest.expected_migration_count}
   or (select max(version) from supabase_migrations.schema_migrations)<>'${manifest.migration_version}' then raise exception 'Migration history changed'; end if;
end $$;
lock table public.card_prints in share row exclusive mode;
${stage}
do $$ begin
 if (select count(*) from card_prints)<>${manifest.expected_prints}
   or (select md5(string_agg((to_jsonb(p)-'rarity_codes'-'rarity_provenance')::text,'' order by id)) from card_prints p)<>'${manifest.protected_prints_hash}'
   then raise exception 'Protected print data drift'; end if;
 if (select count(*) from rarity_release_stage)<>${manifest.verified} or (select count(distinct id) from rarity_release_stage)<>${manifest.verified} then raise exception 'Stage identity mismatch'; end if;
end $$;`;
const apply=`${prefix}
do $$ begin
 if exists(select 1 from card_prints p join rarity_release_stage s on s.id=p.id where p.deleted_at is not null or p.manually_locked
   or not ((p.rarity_codes is null and p.rarity_provenance is null) or (p.rarity_codes=s.codes and p.rarity_provenance=s.provenance)))
   then raise exception 'Rarity value or lock changed'; end if;
 if exists(select 1 from card_prints p where not exists(select 1 from rarity_release_stage s where s.id=p.id) and (p.rarity_codes is not null or p.rarity_provenance is not null))
   then raise exception 'Unverified row has an unexpected rarity value'; end if;
end $$;
update public.card_prints p set rarity_codes=s.codes,rarity_provenance=s.provenance
from rarity_release_stage s where p.id=s.id and p.rarity_codes is null and p.rarity_provenance is null;
do $$ begin
 if (select count(*) from card_prints p join rarity_release_stage s on s.id=p.id where p.rarity_codes=s.codes and p.rarity_provenance=s.provenance)<>${manifest.verified}
   or (select md5(string_agg((to_jsonb(p)-'rarity_codes'-'rarity_provenance')::text,'' order by id)) from card_prints p)<>'${manifest.protected_prints_hash}' then raise exception 'Post-apply verification failed'; end if;
end $$;
commit;
`;
const rollback=`${prefix}
do $$ begin
 if (select count(*) from card_prints p join rarity_release_stage s on s.id=p.id where p.rarity_codes=s.codes and p.rarity_provenance=s.provenance and not p.manually_locked and p.deleted_at is null)<>${manifest.verified}
 then raise exception 'Rollback values changed since release'; end if;
end $$;
update public.card_prints p set rarity_codes=null,rarity_provenance=null from rarity_release_stage s where p.id=s.id;
commit;
`;
await mkdir(out,{recursive:true});
await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await writeFile(`${out}/apply.sql`,apply);await writeFile(`${out}/rollback-data.sql`,rollback);
await writeFile(`${out}/source-hashes.json`,JSON.stringify({apply:createHash('sha256').update(apply).digest('hex'),rollback:createHash('sha256').update(rollback).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({verified:manifest.verified,unverified:manifest.unverified,groups:manifest.groups.length,sqlBytes:Buffer.byteLength(apply)}));
