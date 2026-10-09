import {readFile,writeFile} from 'node:fs/promises';
import {buildCompleteSql} from './build-dm26ex4-complete.mjs';
const [manifestFile,proofFile,baselineFile,output]=process.argv.slice(2);
if(!output)throw Error('Usage: build-dm26ex4-release.mjs manifest proof baseline output');
const manifest=JSON.parse(await readFile(manifestFile,'utf8')),proof=JSON.parse(await readFile(proofFile,'utf8')),baseline=JSON.parse(await readFile(baselineFile,'utf8'));
if(proof.length!==159||manifest.cards.length!==162)throw Error('Incomplete release input');
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const hashQueries={
 history:"select md5(string_agg(version||':'||name,',' order by version)) from supabase_migrations.schema_migrations where version<>'20261009171721'",
 formal_cards_hash:"select md5(string_agg((to_jsonb(c)-'metadata_provenance')::text,',' order by id)) from public.canonical_cards c where source_checked_at is not null",
 other_prints_hash:"select md5(string_agg((to_jsonb(p)-array['metadata_provenance','source_metadata'])::text,',' order by id)) from public.card_prints p where product_id is distinct from 266",
 products_hash:"select md5(string_agg(to_jsonb(p)::text,',' order by id)) from public.card_products p",
 terms_hash:`select md5(string_agg(to_jsonb(t)::text,',' order by id)) from public.card_search_terms t where id<=${baseline.terms_max}`,
 canonical_identity_hash:`select md5(string_agg((to_jsonb(c)-array['metadata_provenance','updated_at','name_kana','cost','cost_is_infinite','civilizations','card_types','races','power_text','power_value'])::text,',' order by id)) from public.canonical_cards c where id<=${baseline.canonical_max}`,
};
for(const key of Object.keys(hashQueries))if(!/^[a-f0-9]{32}$/u.test(baseline[key]??''))throw Error('Missing safety checksum');
const checks=Object.entries(hashQueries).map(([key,query])=>`if (${query}) is distinct from ${q(baseline[key])} then raise exception 'Release safety checksum changed: ${key}'; end if;`).join('\n');
const pre=`do $$ begin ${checks}
if (select count(*) from public.card_prints where product_id=266)<>48 then raise exception 'DM26-EX4 baseline changed'; end if;
end $$;\n`;
const post=`do $$ begin ${checks}
if (select count(*) from public.card_prints where product_id=266 and deleted_at is null)<>162 or (select count(*) from public.card_prints where product_id=266 and image_key is not null)<>159 then raise exception 'Unexpected final print/image counts'; end if;
${baseline.prints.map(p=>`if not exists(select 1 from public.card_prints where id=${p.id} and canonical_card_id=${p.canonical_card_id} and product_id=266 and card_number=${q(p.number)} and deleted_at is null) then raise exception 'Previous print identity changed'; end if;`).join('\n')}
end $$;\n`;
let sql=buildCompleteSql(manifest,proof);
sql=sql.replace('create temporary table dm26ex4_preview',()=>pre+'create temporary table dm26ex4_preview').replace(/^commit;\s*$/mu,()=>post+'commit;\n');
await writeFile(output,sql);console.log('Prepared atomic release with pre/post preservation checks; not applied.');
