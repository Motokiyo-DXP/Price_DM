import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {buildPreviewSql,validatePreview} from './build-dm26ex4-preview.mjs';
import {canonicalName} from './dm26ex4-canonical-mappings.mjs';

const q=value=>`'${String(value).replaceAll("'","''")}'`;
const array=value=>`array[${value.map(q).join(',')}]::text[]`;
const json=value=>`${q(JSON.stringify(value))}::jsonb`;
export function validateComplete(raw,proofs=[]){
 validatePreview(raw);
 const numbers=new Set(),keys=new Set();
 for(const c of raw.cards){
  if(numbers.has(c.card_number))throw Error('Duplicate card number');numbers.add(c.card_number);
  if(c.detail && (!c.detail.matched||c.detail.verified!==false||c.detail.source!=='dmwiki'||
   !/^https:\/\/(?:m\.)?dmwiki\.net\/%E3%80%8A/iu.test(c.detail.source_url)))throw Error('Untraceable details');
  if(!c.image)continue;
  const i=c.image;
  if(i.name!==c.name||i.card_number!==c.card_number||i.source!=='official_product'||i.verified!==true||
    i.identity_check!=='visual_name_and_printed_number'||!/^https:\/\/dm\.takaratomy\.co\.jp\/wp-content\/themes\/dm2019\/img\/product\/dm26ex4\/all-precedence\/[0-9-]+\.jpg$/u.test(i.source_url)||
    !/^[a-f0-9]{64}$/u.test(i.sha256)||!/^official\/dm26ex4-preview-[0-9-]+-[a-f0-9]{16}$/u.test(i.key)||keys.has(i.key))throw Error('Unverified or duplicate image identity');
  keys.add(i.key);
 }
 for(const p of proofs){
  const image=raw.cards.find(c=>c.image?.key===p.key)?.image;
  if(!image||p.status!==200||p.sha256!==image.sha256||p.decoded!==true||
    p.url!==`https://dm-price-tracker-card-images.tcg-price-checker.workers.dev/${p.key}.webp`)throw Error('Invalid public image verification');
 }
 return true;
}
export function buildCompleteSql(raw,proofs=[]){
 validateComplete(raw,proofs);
 const verified=new Set(proofs.map(p=>p.key));
 let sql=buildPreviewSql({...raw,reading_fragments:[]}).replace(/^commit;\s*$/mu,'');
 // One transaction retains the existing importer checks, IDs, locks and search terms.
 sql+='\ncreate temporary table dm26ex4_detail(number text primary key,record jsonb) on commit drop;\n';
 sql+='insert into dm26ex4_detail values\n'+raw.cards.map(c=>`(${q('DM26EX4 '+c.card_number)},${json(c)})`).join(',\n')+';\n';
 const fields=['name_kana','cost','cost_is_infinite','civilizations','card_types','races','power_text','power_value'];
 for(const c of raw.cards.filter(c=>c.metadata)){
  const m=c.metadata,updates=[],provenance={};
  for(const field of fields){
   const value=m[field];if(value==null||(Array.isArray(value)&&value.length===0)||field==='cost_is_infinite'&&!value)continue;
   const missing=Array.isArray(value)?`cardinality(c.${field})=0`:field==='cost_is_infinite'?`c.cost is null and not c.cost_is_infinite`:`c.${field} is null`;
   const rendered=Array.isArray(value)?array(value):typeof value==='string'?q(value):String(value);
   updates.push(`${field}=case when ${missing} then ${rendered} else c.${field} end`);
   provenance[field]={source:'dmwiki',verified:false,source_url:c.detail.source_url,status:'observed',value};
  }
  if(updates.length){
   const missingConditions=[];
   const changes=Object.entries(provenance).map(([field,value])=>{
    const missing=Array.isArray(value.value)?`cardinality(c.${field})=0`:field==='cost_is_infinite'?`c.cost is null and not c.cost_is_infinite`:`c.${field} is null`;
    missingConditions.push(`(${missing})`);
    return `case when ${missing} then jsonb_build_object(${q(field)},${json(value)}) else '{}'::jsonb end`;
   });
   sql+=`update public.canonical_cards c set ${updates.join(',')},metadata_provenance=c.metadata_provenance||${changes.join('||')},updated_at=now()
where c.normalized_name_nfkc=pg_catalog.normalize(${q(canonicalName(c))},'NFKC') and c.game_id=(select id from public.tcg_games where slug='duel-masters')
and c.deleted_at is null and not c.manually_locked and c.source_checked_at is null
and (${missingConditions.join(' or ')})
and not exists(select 1 from public.card_prints p where p.canonical_card_id=c.id and p.deleted_at is null and p.official_card_id is not null);\n`;
  }
 }
 sql+=`update public.card_prints p set source_metadata=p.source_metadata||jsonb_build_object('dmwiki',s.record->'detail'),updated_at=now()
from dm26ex4_detail s join public.card_products product on product.product_code='DM26-EX4'
where p.product_id=product.id and p.card_number=s.number and p.deleted_at is null and not p.manually_locked
and s.record->'detail'<>'null'::jsonb and not p.source_metadata ? 'dmwiki';\n`;
 for(const c of raw.cards){
  const number=q('DM26EX4 '+c.card_number),m=c.metadata;
  if(m?.card_texts)sql+=`update public.card_prints p set card_texts=${array(m.card_texts)},metadata_provenance=p.metadata_provenance||jsonb_build_object('card_texts',${json({source:'dmwiki',verified:false,source_url:c.detail.source_url,status:'observed',value:m.card_texts})}),updated_at=now()
where p.card_number=${number} and p.product_id=(select id from public.card_products where product_code='DM26-EX4') and p.deleted_at is null and not p.manually_locked
and p.official_card_id is null and p.source_checked_at is null and cardinality(p.card_texts)=0;\n`;
  if(c.image&&verified.has(c.image.key)){
   sql+=`do $$ begin if exists(select 1 from public.card_prints p where p.card_number=${number} and p.product_id=(select id from public.card_products where product_code='DM26-EX4') and p.image_key is not null and p.image_key<>${q(c.image.key)}) then raise exception 'Existing image changed; stop for review'; end if; end $$;\n`;
   sql+=`update public.card_prints p set image_key=${q(c.image.key)},metadata_provenance=p.metadata_provenance||jsonb_build_object('image_key',${json(c.image)}),source_metadata=p.source_metadata||jsonb_build_object('official_product_image',${json(c.image)}),updated_at=now()
where p.card_number=${number} and p.product_id=(select id from public.card_products where product_code='DM26-EX4') and p.deleted_at is null and not p.manually_locked and p.image_key is null;\n`;
  }
  if(m?.name_kana)sql+=`insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority)
select c.id,${q(m.name_kana)},public.normalize_card_search(${q(m.name_kana)}),'alias_reading','dmwiki',false,40 from public.canonical_cards c
where c.game_id=(select id from public.tcg_games where slug='duel-masters') and c.normalized_name_nfkc=pg_catalog.normalize(${q(canonicalName(c))},'NFKC') and c.deleted_at is null
on conflict(canonical_card_id,normalized_term,term_kind) do nothing;\n`;
 }
 return sql+'commit;\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [manifest,output,proofFile]=process.argv.slice(2);
 if(!manifest||!output)throw Error('Usage: build-dm26ex4-complete.mjs manifest.json output.sql [public-image-proof.json]');
 const raw=JSON.parse(await readFile(manifest,'utf8')),proofs=proofFile?JSON.parse(await readFile(proofFile,'utf8')):[];
 await writeFile(output,buildCompleteSql(raw,proofs));console.log(`Prepared ${raw.cards.length} prints and ${proofs.length} verified image updates; SQL not applied.`);
}
