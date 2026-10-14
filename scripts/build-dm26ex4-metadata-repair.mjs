import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseOfficialCardPowerValue} from './import-dm-cards-sample.mjs';
const fields=['name_kana','cost','cost_is_infinite','civilizations','card_types','races','power_text','power_value'];
const same=(a,b)=>JSON.stringify(Array.isArray(a)?[...a].sort():a)===JSON.stringify(Array.isArray(b)?[...b].sort():b);
const readingKey=s=>String(s).normalize('NFKC').replace(/[ぁ-ゖ]/gu,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).replace(/\s*[／/]\s*/gu,'/').trim();
const textOwnershipKey=a=>Array.isArray(a)?JSON.stringify(a.map(s=>typeof s==='string'?s.replace(/\r\n/gu,'\n'):s)):null;
const empty=v=>v===null||Array.isArray(v)&&!v.length;
export function auditCompleteness(card){
 if(card.deleted_at)return 'deleted';
 if(!card.card_types?.length)return 'unavailable_basic';
 if(card.cost_is_infinite)return 'infinite';
 if(card.cost!==null)return 'observed';
 if(card.metadata_provenance?.cost?.status==='not_applicable')return 'not_applicable';
 // These are review candidates, never inferred missing costs or repair inputs.
 if(card.card_types.some(t=>/キング・セル|零龍|禁断の鼓動|最終禁断フィールド|ルール・プラス/u.test(t)))return 'special_cost_review';
 return 'unavailable_cost';
}
export function buildRepairPlan(baseline,research,observations,manifest){
 const changes=[],conflicts=[],holds=[],audits=[],reading_terms=[];
 const observationMap=new Map(observations.cards.map(([id,cost,civilizations,card_types,races,power_text])=>[id,{cost,cost_is_infinite:false,civilizations,card_types,races,power_text,power_value:parseOfficialCardPowerValue(power_text)}]));
 for(const card of baseline.cards){
  const r=research.results.find(x=>x.id===card.id),image=observationMap.get(card.id),civs=observations.civilizations[card.id];
  const prints=baseline.prints.filter(p=>p.canonical_card_id===card.id);
  const primary=prints.find(p=>/ \d+\/99$/u.test(p.card_number))??prints[0];
  const officialImage=manifest.cards.find(c=>'DM26EX4 '+c.card_number===primary.card_number)?.image;
  const reading=observations.readings?.[card.id];
  const candidate={...(r?.metadata??{}),...(image??{}),...(civs?{civilizations:civs}:{}),...(reading?{name_kana:reading}:{})};
  const delta={},provenance={};
  for(const field of fields){
   const value=candidate[field];
   if(value===undefined||value===null||Array.isArray(value)&&!value.length||field==='cost_is_infinite'&&!value)continue;
   const checked=Boolean(image&&Object.hasOwn(image,field)||field==='civilizations'&&civs||field==='name_kana'&&reading);
   if(!empty(card[field])&&!(field==='cost_is_infinite'&&value===true&&card.cost===null&&!card.cost_is_infinite)){
    if(!same(card[field],value)&&!(field==='name_kana'&&readingKey(card[field])===readingKey(value)))conflicts.push({id:card.id,name:card.name,field,current:card[field],candidate:value,source:checked?'official_product_image':'dmwiki',verified:checked});
    continue;
   }
   if(card.manually_locked){holds.push({id:card.id,name:card.name,field,reason:'manually_locked'});continue;}
   if(checked&&!officialImage)throw Error('Missing checked image provenance');
   delta[field]=value;provenance[field]={source:checked?'official_product_image':'dmwiki',verified:checked,source_url:checked?officialImage.source_url:r.detail.source_url,status:'observed',value};
  }
  if(Object.keys(delta).length)changes.push({table:'canonical_cards',id:card.id,before:card,values:delta,provenance});
  if(delta.name_kana)reading_terms.push({canonical_card_id:card.id,term:delta.name_kana,source:provenance.name_kana.source,verified:provenance.name_kana.verified});
  const texts=observations.texts[card.id]??r?.metadata?.card_texts;
  for(const print of prints){
   if(print.manually_locked||card.manually_locked){holds.push({id:print.id,name:card.name,reason:card.manually_locked?'canonical_locked':'print_locked'});continue;}
   const values={},prov={};
   if(texts&&texts.length&&empty(print.card_texts)){
    values.card_texts=texts;prov.card_texts={source:observations.texts[card.id]?'official_product_image':'dmwiki',verified:Boolean(observations.texts[card.id]),source_url:observations.texts[card.id]?officialImage.source_url:r.detail.source_url,status:'observed',value:texts};
   }
   const correction=observations.print_text_corrections?.[print.id];
   if(correction){
    const imageSource=manifest.cards.find(c=>'DM26EX4 '+c.card_number===print.card_number)?.image;
    const owner=print.metadata_provenance?.card_texts;
    if(!imageSource||imageSource.source_url!==correction.source_url||!Array.isArray(correction.value))throw Error('Unverified print text correction');
    if(print.source_checked_at!==null||print.official_card_id!==null||owner?.source!=='dmwiki'||textOwnershipKey(owner.value)!==textOwnershipKey(print.card_texts))holds.push({id:print.id,name:card.name,field:'card_texts',reason:'existing_text_ownership_changed'});
    else{values.card_texts=correction.value;prov.card_texts={source:'official_product_image',verified:true,source_url:correction.source_url,status:'observed',value:correction.value};}
   }
   if(image){
    const faces=r?.detail?.matched?r.detail.faces:[{name:card.name,cost:{status:'observed',value:image.cost},cost_is_infinite:false,civilizations:{status:'observed',value:image.civilizations},card_types:{status:'observed',value:image.card_types},races:image.races.length?{status:'observed',value:image.races}:{status:'not_applicable',value:null},power:image.power_text?{status:'observed',value:image.power_text}:{status:'not_applicable',value:null},reading:{status:'unavailable',value:null}}];
    if(reading&&!r?.detail?.matched)faces[0].reading={status:'observed',value:reading};
    values.source_metadata={...print.source_metadata,metadata_repair_20261014:{source_url:officialImage.source_url,identity_check:'visual_name_and_printed_number',basic_fields:image,faces,faces_source:r?.detail?.matched?'dmwiki':'official_product_image',faces_verified:!r?.detail?.matched,reading_status:reading?'observed_official_image':r?.metadata?.name_kana?'observed_unverified':'unavailable'}};
   }
   if(Object.keys(values).length)changes.push({table:'card_prints',id:print.id,canonical_name:card.name,before:print,values,provenance:prov});
  }
  const final={...card,...delta};
  audits.push({id:card.id,name:card.name,prints:prints.map(p=>p.card_number),before:auditCompleteness(card),after:auditCompleteness(final),official_image_checked:Boolean(image||civs),wiki_status:r?.detail?.matched?'matched':'unavailable',reading_available:Boolean(final.name_kana),texts_available:Boolean(texts)||prints.every(p=>p.card_texts.length>0)});
 }
 return {product_id:baseline.product.id,checked_cards:baseline.cards.length,checked_prints:baseline.prints.length,changes,reading_terms,conflicts,holds,audits};
}
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const j=v=>`${q(JSON.stringify(v))}::jsonb`;
function sqlValue(value){return Array.isArray(value)?`array(select jsonb_array_elements_text(${j(value)}))::text[]`:value===null?'null':typeof value==='object'?j(value):typeof value==='string'?q(value):String(value);}
export function buildRepairSql(plan){
 if(plan.product_id!==266||!plan.changes.length)throw Error('Invalid repair plan');
 const validTables=new Set(['canonical_cards','card_prints']);
 let sql="-- Local validated candidate. Production application requires explicit sole-release-owner authorization.\nbegin;\nset local lock_timeout='5s';\nlock table public.canonical_cards, public.card_prints, public.card_search_terms in share row exclusive mode;\n";
 for(const change of plan.changes){
  if(!validTables.has(change.table)||!Number.isSafeInteger(change.id)||change.before.id!==change.id||change.before.manually_locked)throw Error('Unsafe repair identity');
  const allowed=change.table==='canonical_cards'?fields:['card_texts','source_metadata'];
  if(Object.keys(change.values).some(k=>!allowed.includes(k)))throw Error('Unsafe repair field');
  const before={...change.before};delete before.updated_at;
  const after={...before,...change.values,metadata_provenance:{...before.metadata_provenance,...change.provenance}};
  const assignments=Object.entries(change.values).map(([k,v])=>`${k}=${sqlValue(v)}`);
  assignments.push(`metadata_provenance=${j(after.metadata_provenance)}`,'updated_at=now()');
  if(change.table==='card_prints'){
   if(typeof change.canonical_name!=='string'||!Number.isSafeInteger(change.before.canonical_card_id))throw Error('Unsafe canonical identity');
   sql+=`do $$ begin if not exists(select 1 from public.canonical_cards where id=${change.before.canonical_card_id} and name=${q(change.canonical_name)} and game_id=1 and deleted_at is null and not manually_locked) then raise exception 'Repair canonical identity or lock changed: ${change.before.canonical_card_id}'; end if; end $$;\n`;
  }
  sql+=`do $$ begin if not exists(select 1 from public.${change.table} t where id=${change.id} and (to_jsonb(t)-'updated_at'=${j(before)} or to_jsonb(t)-'updated_at'=${j(after)})) then raise exception 'Repair baseline changed: ${change.table}/${change.id}'; end if; end $$;\n`;
  sql+=`update public.${change.table} t set ${assignments.join(',')} where id=${change.id} and to_jsonb(t)-'updated_at'=${j(before)};\n`;
 }
 for(const term of plan.reading_terms??[]){
  if(!Number.isSafeInteger(term.canonical_card_id)||typeof term.term!=='string'||!['official_product_image','dmwiki'].includes(term.source)||typeof term.verified!=='boolean')throw Error('Unsafe reading term');
  sql+=`insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority) select ${term.canonical_card_id},${q(term.term)},public.normalize_card_search(${q(term.term)}),'alias_reading',${q(term.source)},${term.verified},40 where not exists(select 1 from public.card_search_terms where canonical_card_id=${term.canonical_card_id} and normalized_term=public.normalize_card_search(${q(term.term)}) and term_kind='alias_reading') on conflict(canonical_card_id,normalized_term,term_kind) do nothing;\n`;
 }
 return sql+'commit;\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const baseline=JSON.parse(await readFile('docs/dm26ex4-baseline-20261014.json','utf8')),research=JSON.parse(await readFile(process.argv[2]??'docs/dm26ex4-repair/research.json','utf8')),observations=JSON.parse(await readFile('scripts/dm26ex4-image-observations.json','utf8')),manifest=JSON.parse(await readFile('scripts/dm26ex4-complete.json','utf8'));
 const plan=buildRepairPlan(baseline,research,observations,manifest);
 await mkdir('docs/dm26ex4-repair',{recursive:true});
 await writeFile('docs/dm26ex4-repair/plan.json',JSON.stringify(plan,null,2));
 await writeFile('scripts/dm26ex4-metadata-repair.sql',buildRepairSql(plan));
 await writeFile('docs/dm26ex4-repair/research.json',JSON.stringify(research,null,2));
 console.log(JSON.stringify({cards:plan.checked_cards,prints:plan.checked_prints,canonical_updates:plan.changes.filter(c=>c.table==='canonical_cards').length,print_updates:plan.changes.filter(c=>c.table==='card_prints').length,conflicts:plan.conflicts.length,holds:plan.holds.length,basic_missing_after:plan.audits.filter(c=>c.after==='unavailable_basic').length,reading_holds:plan.audits.filter(c=>!c.reading_available).length}));
}
