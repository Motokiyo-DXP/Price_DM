import {buildReconciliationSql,officialCardId} from './build-dm26ex4-reconciliation.mjs';
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const json=v=>`${q(JSON.stringify(v))}::jsonb`;
const columns=new Set(['name_kana','cost','cost_is_infinite','civilizations','card_types','races','power_text','power_value','card_texts']);

// Supply explicit field availability from audited official detail pages. Unavailable
// fields are retained, while official_absent clears only source-owned provisional values.
// Run this scoped upgrade instead of the generic overwrite importer for existing prints.
export function buildOfficialUpdateSql(records){
 if(!records.length)throw Error('No official records');
 for(const r of records){
  if(!officialCardId(r.official_url)||r.official_card_id!==officialCardId(r.official_url)||
   !/^DM26EX4 /u.test(r.card_number)||!r.name||!r.fields||!Array.isArray(r.faces))throw Error('Invalid audited official record');
  for(const [field,item] of Object.entries(r.fields)){
   if(!columns.has(field)||!['observed','official_absent','unavailable'].includes(item.status))throw Error('Invalid field availability');
   if(item.status==='observed'&&!Object.hasOwn(item,'value'))throw Error('Missing observed value');
  }
 }
 let sql=buildReconciliationSql(records).replace(/^commit;\s*$/mu,'');
 for(const r of records){
  const updates=new Map();
  for(const [field,item] of Object.entries(r.fields)){
   if(item.status==='unavailable')continue;
   const isPrint=field==='card_texts',table=isPrint?'card_prints':'canonical_cards';
   const value=item.status==='official_absent'?(field==='cost_is_infinite'?false:['civilizations','card_types','races','card_texts'].includes(field)?[]:null):item.value;
   const encoded=Array.isArray(value)?`array[${value.map(q).join(',')}]::text[]`:value===null?'null':typeof value==='string'?q(value):String(value);
   const empty=Array.isArray(value)?`cardinality(t.${field})=0`:field==='cost_is_infinite'?`not t.cost_is_infinite`:`t.${field} is null`;
   const identity=isPrint?`t.card_number=${q(r.card_number)} and t.product_id=(select id from public.card_products where product_code='DM26-EX4')`:
    `t.id=(select p.canonical_card_id from public.card_prints p where p.card_number=${q(r.card_number)} and p.product_id=(select id from public.card_products where product_code='DM26-EX4'))`;
   const owned=`t.metadata_provenance->${q(field)}->>'source' in ('dmwiki','official_catalog') and to_jsonb(t.${field}) is not distinct from t.metadata_provenance->${q(field)}->'value'`;
   sql+=`do $$ begin if exists(select 1 from public.${table} t where ${identity} and not (${empty} or (${owned}) or t.${field} is not distinct from ${encoded})) then raise exception 'Unowned or manually edited field ${field}; stop for review'; end if; end $$;\n`;
   const group=updates.get(table)??{identity,fields:[],provenance:{}};
   group.fields.push(`${field}=${encoded}`);group.provenance[field]={source:'official_catalog',verified:true,source_url:r.official_url,status:item.status,value};updates.set(table,group);
  }
  for(const [table,group] of updates)sql+=`update public.${table} t set ${group.fields.join(',')},metadata_provenance=t.metadata_provenance||${json(group.provenance)},updated_at=now() where ${group.identity} and not t.manually_locked and t.deleted_at is null;\n`;
  sql+=`update public.card_prints t set source_metadata=t.source_metadata||jsonb_build_object('official_catalog',${json(r)}),updated_at=now() where t.card_number=${q(r.card_number)} and t.product_id=(select id from public.card_products where product_code='DM26-EX4') and not t.manually_locked and t.deleted_at is null;\n`;
 }
 return sql+'commit;\n';
}

// Upgrade artwork only after separately verifying the new public WebP, and only
// while the current image still equals the previously imported preview key.
export function buildOfficialImageReplacementSql({printId,oldKey,newKey,officialUrl,proof}){
 if(!Number.isSafeInteger(printId)||!officialCardId(officialUrl)||!/^official\/[a-z0-9_-]+$/iu.test(newKey)||
  !/^official\/dm26ex4-preview-[0-9-]+-[a-f0-9]{16}$/u.test(oldKey)||proof?.status!==200||proof.decoded!==true||
  !/^[a-f0-9]{64}$/u.test(proof.sha256??'')||proof.url!==`https://dm-price-tracker-card-images.tcg-price-checker.workers.dev/${newKey}.webp`)throw Error('Invalid verified official replacement');
 return `begin; set local lock_timeout='5s'; lock table public.card_prints in share row exclusive mode;
do $$ begin if not exists(select 1 from public.card_prints where id=${printId} and official_url=${q(officialUrl)} and not manually_locked and deleted_at is null and image_key=${q(oldKey)} and metadata_provenance->'image_key'->>'key'=${q(oldKey)}) then raise exception 'Image identity or ownership changed; stop'; end if; end $$;
update public.card_prints set image_key=${q(newKey)},image_updated_at=now(),metadata_provenance=metadata_provenance||jsonb_build_object('image_key',${json({source:'official_catalog',verified:true,source_url:officialUrl,key:newKey,sha256:proof.sha256})}),updated_at=now() where id=${printId}; commit;`;
}
