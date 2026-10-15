import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Hash one row at a time. Never retain full-table JSON aggregates in memory.
export const scopeChecksumSql=`select jsonb_build_object(
 'cards',(select md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' order by id),'')) from public.canonical_cards c where not exists(select 1 from public.card_prints p where p.product_id=266 and p.canonical_card_id=c.id)),
 'prints',(select md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' order by id),'')) from public.card_prints p where product_id is distinct from 266),
 'terms',(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),'')) from public.card_search_terms t where not exists(select 1 from public.card_prints p where p.product_id=266 and p.canonical_card_id=t.canonical_card_id)),
 'product',(select md5(to_jsonb(p)::text) from public.card_products p where id=266))::text`;

export const metricsSql=`select jsonb_build_object(
 'cards',count(*),'prints',(select count(*) from public.card_prints where product_id=266),
 'terms',(select count(*) from public.card_search_terms where canonical_card_id in(select canonical_card_id from public.card_prints where product_id=266)),
 'cost_missing',count(*) filter(where cost is null and not cost_is_infinite),
 'civilizations_empty',count(*) filter(where cardinality(civilizations)=0),
 'types_empty',count(*) filter(where cardinality(card_types)=0),
 'reading_empty',count(*) filter(where name_kana is null or name_kana=''),
 'kusabitake_cost',max(cost) filter(where id=43965),
 'blocker',(select card_texts::text like '%ブロッカー%' from public.card_prints where id=48526))
 from public.canonical_cards where id in(select canonical_card_id from public.card_prints where product_id=266)`;

export function buildReleaseSql(source,{rollback=false}={}){
 if(!source.includes('Repair baseline changed:')||!source.includes("product_id")||!/^commit;\s*$/m.test(source))throw Error('Expected reviewed DM26-EX4 repair SQL');
 const lock='lock table public.canonical_cards, public.card_prints, public.card_search_terms in share row exclusive mode;';
 if(source.split(lock).length!==2)throw Error('Expected exactly one repair scope lock');
 const header=`${lock}
set local statement_timeout='15s';
set local work_mem='1MB';
select set_config('price_dm.outside_before',(${scopeChecksumSql}),true);`;
 const ending=`do $release$ declare actual text; m jsonb; begin
 actual:=(${scopeChecksumSql});
 if actual is distinct from current_setting('price_dm.outside_before') then raise exception 'Outside repair scope changed'; end if;
 m:=(${metricsSql});
 if m is distinct from '{"cards":151,"prints":162,"terms":493,"cost_missing":0,"civilizations_empty":0,"types_empty":0,"reading_empty":1,"kusabitake_cost":3,"blocker":true}'::jsonb then raise exception 'Repair invariants failed: %',m; end if;
 end $release$;
${metricsSql};
${rollback?'rollback':'commit'};
`;
 // A replacement callback preserves PostgreSQL dollar quotes literally.
 return source.replace(lock,()=>header).replace(/commit;\s*$/,()=>ending);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output,...flags]=process.argv.slice(2);
 if(!input||!output||flags.some(f=>f!=='--rollback'))throw Error('Usage: dm26ex4-release-guard.mjs input.sql output.sql [--rollback]');
 await writeFile(output,buildReleaseSql(await readFile(input,'utf8'),{rollback:flags.includes('--rollback')}));
 console.log('Prepared guarded SQL only; no database connection or application.');
}
