import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {load} from 'cheerio';
import {parseCardDetail} from './import-dm-cards-sample.mjs';
import {assertProductionDbRelease} from './production-db-guard.mjs';

export const publicBase='https://dm-price-tracker-card-images.tcg-price-checker.workers.dev';
export const bundle='docs/releases/dm26ex5-images-20261108';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n');
const expectedIds=new Set([...Array.from({length:40},(_,i)=>String(i+1).padStart(3,'0')), ...[['DP',40],['G',20],['S',10],['SEC',5]].flatMap(([s,n])=>Array.from({length:n},(_,i)=>s+String(i+1).padStart(3,'0')))].map(s=>'dm26ex5-'+s));
export function validate(m){
 if(m.authorization!=='site_operator_confirmed_existing_permission_20261108'||m.rows.length!==115)throw Error('scope or authorization mismatch');
 const ids=new Set(),prints=new Set(),keys=new Set();
 for(const r of m.rows){
  if(!expectedIds.has(r.official_id)||ids.has(r.official_id)||prints.has(r.print_id)||keys.has(r.image_key))throw Error('duplicate or nonofficial print');
  if(!Number.isSafeInteger(r.print_id)||!Number.isSafeInteger(r.canonical_id)||r.product_id!==268)throw Error('DB identity missing');
  if(r.image_key!==`official/${r.official_id}-${r.sha256.slice(0,16)}`||!/^\w{64}$/.test(r.sha256)||!r.decoded||!r.print_match_verified||r.width!==384||r.height<500||r.format!=='webp')throw Error('unverified asset');
  if(r.source_url!==`https://dm.takaratomy.co.jp/wp-content/card/cardimage/${r.official_id}${r.twinpact?'a':''}.jpg`)throw Error('unexpected source');
  ids.add(r.official_id);prints.add(r.print_id);keys.add(r.image_key);
 }
 return m;
}

export function buildSql(m){
 validate(m);
 const rows=JSON.stringify(m.rows.map(r=>({id:r.print_id,canonical_id:r.canonical_id,official_id:r.official_id,number:r.number,product_id:r.product_id,image_key:r.image_key}))).replaceAll("'","''");
 return `-- EX5 images only. No insert, canonical change, signed data or asset overwrite.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$ BEGIN
 IF current_setting('price_dm.release_project_ref',true) IS DISTINCT FROM 'fxhlobydispnbywxhirn' OR current_setting('price_dm.image_manifest_sha',true) IS DISTINCT FROM '${sha(JSON.stringify(m))}' THEN RAISE EXCEPTION 'release guard settings missing'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('price-dm-production-release',0)) THEN RAISE EXCEPTION 'release busy'; END IF;
END $guard$;
LOCK TABLE canonical_cards,card_prints,card_products,card_search_terms IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE deck_cards,price_records IN SHARE MODE;
CREATE TEMP TABLE ex5_image_input ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset('${rows}'::jsonb) AS r(id bigint,canonical_id bigint,official_id text,number text,product_id bigint,image_key text);
DO $guard$ BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>181 THEN RAISE EXCEPTION 'migration history changed'; END IF;
 IF (SELECT count(*) FROM card_prints WHERE official_card_id LIKE 'dm26ex5-%')<>115 OR (SELECT count(*) FROM card_prints WHERE product_id=268)<>115 OR NOT EXISTS(SELECT 1 FROM card_products WHERE id=268 AND product_code='DM26-EX5') THEN RAISE EXCEPTION 'product scope changed'; END IF;
 IF (SELECT count(*) FROM ex5_image_input r JOIN card_prints p ON p.id=r.id AND p.official_card_id=r.official_id AND p.card_number=r.number AND p.canonical_card_id=r.canonical_id AND p.product_id=r.product_id JOIN canonical_cards c ON c.id=p.canonical_card_id WHERE p.deleted_at IS NULL AND NOT p.manually_locked AND c.deleted_at IS NULL AND NOT c.manually_locked AND (p.image_key IS NULL OR p.image_key=r.image_key))<>115 THEN RAISE EXCEPTION 'identity, lock, deletion or image conflict'; END IF;
END $guard$;
CREATE TEMP TABLE ex5_image_before_prints ON COMMIT DROP AS SELECT id,to_jsonb(p) AS data FROM card_prints p;
CREATE TEMP TABLE ex5_image_before_other ON COMMIT DROP AS
 SELECT 'canonical' AS source,id::text AS id,to_jsonb(t) AS data FROM canonical_cards t UNION ALL
 SELECT 'product',id::text,to_jsonb(t) FROM card_products t UNION ALL
 SELECT 'search',id::text,to_jsonb(t) FROM card_search_terms t UNION ALL
 SELECT 'deck',id::text,to_jsonb(t) FROM deck_cards t UNION ALL
 SELECT 'price',id::text,to_jsonb(t) FROM price_records t;
UPDATE card_prints p SET image_key=r.image_key FROM ex5_image_input r WHERE p.id=r.id AND p.image_key IS DISTINCT FROM r.image_key;
DO $guard$ BEGIN
 IF (SELECT count(*) FROM card_prints)<>(SELECT count(*) FROM ex5_image_before_prints) OR EXISTS(SELECT 1 FROM ex5_image_before_prints b FULL JOIN card_prints p ON p.id=b.id LEFT JOIN ex5_image_input r ON r.id=p.id WHERE b.id IS NULL OR p.id IS NULL OR CASE WHEN r.id IS NOT NULL THEN (to_jsonb(p)-'image_key'-'updated_at') IS DISTINCT FROM (b.data-'image_key'-'updated_at') ELSE to_jsonb(p) IS DISTINCT FROM b.data END) THEN RAISE EXCEPTION 'unexpected print change'; END IF;
 IF EXISTS(WITH after_rows AS (
 SELECT 'canonical' AS source,id::text AS id,to_jsonb(t) AS data FROM canonical_cards t UNION ALL
 SELECT 'product',id::text,to_jsonb(t) FROM card_products t UNION ALL
 SELECT 'search',id::text,to_jsonb(t) FROM card_search_terms t UNION ALL
 SELECT 'deck',id::text,to_jsonb(t) FROM deck_cards t UNION ALL
 SELECT 'price',id::text,to_jsonb(t) FROM price_records t)
 SELECT 1 FROM ex5_image_before_other b FULL JOIN after_rows a USING(source,id) WHERE a.data IS DISTINCT FROM b.data) THEN RAISE EXCEPTION 'unrelated data changed'; END IF;
 IF (SELECT count(*) FROM card_prints p JOIN ex5_image_input r ON r.id=p.id AND r.image_key=p.image_key)<>115 THEN RAISE EXCEPTION 'image count mismatch'; END IF;
END $guard$;
SELECT jsonb_build_object('official_images',115,'changed',(SELECT count(*) FROM card_prints p JOIN ex5_image_before_prints b USING(id) WHERE to_jsonb(p) IS DISTINCT FROM b.data),'protected_rows_unchanged',true) AS result;
COMMIT;
`;
}

async function stage(source){
 const approved=await json('docs/releases/dm26ex5-20261108/release-candidate-manifest.json');
 const snapshot=await json('.local/ex5-image-before.json');
 if(snapshot.migrations!==181||snapshot.prints.length!==115)throw Error('snapshot scope');
 await fs.mkdir(bundle,{recursive:true});await fs.mkdir('.local/ex5-images/source',{recursive:true});await fs.mkdir('.local/ex5-images/webp',{recursive:true});
 const rows=[];
 for(const r of approved.rows){
  const db=snapshot.prints.find(p=>p.official_id===r.official_id);
  if(!db||db.number!==r.number||db.image_key!==null||db.manually_locked||db.deleted_at||db.canonical_locked||db.canonical_deleted||(r.canonical_id&&r.canonical_id!==db.canonical_id))throw Error('snapshot identity '+r.official_id);
  const html=await fs.readFile(path.join(source,'raw',r.official_id+'.html'),'utf8');
  const official_url='https://dm.takaratomy.co.jp/card/detail/?id='+r.official_id;
  const card=parseCardDetail(html,official_url),$=load(html);
  const reviewedTwinpact=r.official_id==='dm26ex5-030'&&db.canonical_id===44080&&r.name==='闇鎧亜ジャック・アルカディアス／執拗なる鎧亜の牢獄'&&card.name==='闇鎧亜ジャック・アルカディアス / 執拗なる鎧亜の牢獄';
  if((card.name!==r.name&&!reviewedTwinpact)||card.card_number!==r.number)throw Error('official name/number mismatch '+r.official_id);
  const source_url=new URL($('.card-img img').first().attr('src'),'https://dm.takaratomy.co.jp').href;
  const twinpact=$('.cardDetail td.type').length===2;
  if(source_url!==`https://dm.takaratomy.co.jp/wp-content/card/cardimage/${r.official_id}${twinpact?'a':''}.jpg`||$('meta[property="og:image"]').attr('content')!==source_url)throw Error('official image mapping mismatch '+r.official_id);
  const original=path.join('.local/ex5-images/source',r.official_id+'.jpg');
  let bytes;try{bytes=await fs.readFile(original);}catch(e){if(e.code!=='ENOENT')throw e;const res=await fetch(source_url,{headers:{'user-agent':'DM-Souba/0.2 (licensed card-image archive)'},signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('download '+r.official_id+' '+res.status);bytes=Buffer.from(await res.arrayBuffer());await fs.writeFile(original,bytes);await new Promise(r=>setTimeout(r,250));}
  const sourceInfo=await sharp(bytes).metadata();await sharp(bytes).raw().toBuffer();
  if(sourceInfo.width<384||sourceInfo.height<500)throw Error('source too small '+r.official_id);
  const webp=await sharp(bytes).rotate().resize({width:384,withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer();
  const info=await sharp(webp).metadata();await sharp(webp).raw().toBuffer();
  const hash=sha(webp),image_key=`official/${r.official_id}-${hash.slice(0,16)}`;
  await fs.writeFile(path.join('.local/ex5-images/webp',path.basename(image_key)+'.webp'),webp);
  rows.push({official_id:r.official_id,print_id:db.id,canonical_id:db.canonical_id,product_id:db.product_id,name:r.name,number:r.number,official_url,source_url,twinpact,source_html_sha256:sha(html),source_sha256:sha(bytes),source_width:sourceInfo.width,source_height:sourceInfo.height,source_format:sourceInfo.format,source_bytes:bytes.length,image_key,sha256:hash,format:info.format,width:info.width,height:info.height,bytes:webp.length,decoded:true,print_match_verified:true,match_basis:'archived official detail name/number + card-img and og:image agree with official ID + approved manifest + DB print identity'});
  if(rows.length%10===0||rows.length===115)console.log('Staged '+rows.length+'/115');
 }
 const m=validate({authorization:'site_operator_confirmed_existing_permission_20261108',authorization_basis:'Operator confirmed in this session that site card-image permission was obtained at site creation and resolved in prior GPT discussions.',signed_prints_excluded:true,rows});
 await save(bundle+'/manifest.json',m);await fs.writeFile(bundle+'/apply.sql',buildSql(m));
 console.log('manifest sha256 '+sha(JSON.stringify(m)));
}

async function publish(verifyOnly){
 assertProductionDbRelease(process.cwd());
 const m=validate(await json(bundle+'/manifest.json')),proofs=[];
 await fs.mkdir('.local',{recursive:true});
 for(const r of m.rows){
  const url=publicBase+'/'+r.image_key+'.webp',file=path.join('.local/ex5-images/webp',path.basename(r.image_key)+'.webp');
  if(!verifyOnly&&sha(await fs.readFile(file))!==r.sha256)throw Error('staged bytes changed');
  let res=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(res.status===404&&!verifyOnly){
   const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','wrangler@4.38.0','r2','object','put','dm-price-tracker-card-images/'+r.image_key+'.webp','--file',file,'--content-type','image/webp','--cache-control','public,max-age=31536000,immutable','--remote','--config','cloudflare/card-images/wrangler.jsonc'],{shell:process.platform==='win32',encoding:'utf8',windowsHide:true});
   if(result.status!==0)throw Error('R2 upload failed '+r.official_id+': '+(result.stderr||result.stdout).slice(-500));
   res=await fetch(url,{signal:AbortSignal.timeout(30000)});
  }
  if(res.status!==200)throw Error('public GET '+r.official_id+' '+res.status);
  const bytes=Buffer.from(await res.arrayBuffer()),info=await sharp(bytes).metadata();await sharp(bytes).raw().toBuffer();
  if(sha(bytes)!==r.sha256||info.width!==r.width||info.height!==r.height||info.format!=='webp')throw Error('public object mismatch; refusing overwrite '+r.official_id);
  proofs.push({official_id:r.official_id,image_key:r.image_key,url,status:200,sha256:sha(bytes),width:info.width,height:info.height,decoded:true,checked_at:new Date().toISOString()});
  await save('.local/ex5-images-public-proof.json',proofs);
  if(proofs.length%10===0||proofs.length===115)console.log('Public GET/hash/decode '+proofs.length+'/115');
 }
}

async function payload(){
 assertProductionDbRelease(process.cwd());const m=validate(await json(bundle+'/manifest.json'));
 const proofs=await json('.local/ex5-images-public-proof.json');
 if(proofs.length!==115||m.rows.some(r=>!proofs.some(p=>p.official_id===r.official_id&&p.image_key===r.image_key&&p.sha256===r.sha256&&p.status===200&&p.decoded&&Date.now()-Date.parse(p.checked_at)<3600000)))throw Error('fresh public proof required');
 const sql=await fs.readFile(bundle+'/apply.sql','utf8');if(sql!==buildSql(m))throw Error('committed SQL/manifest mismatch');
 await fs.writeFile('.local/ex5-images-production.sql',`SET price_dm.release_project_ref='fxhlobydispnbywxhirn';\nSET price_dm.image_manifest_sha='${sha(JSON.stringify(m))}';\n`+sql);
 console.log(JSON.stringify({rows:115,manifest_sha256:sha(JSON.stringify(m)),sql_sha256:sha(sql)}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [mode,arg]=process.argv.slice(2);
 if(mode==='stage'&&arg)await stage(arg);
 else if(mode==='publish')await publish(false);
 else if(mode==='verify-public')await publish(true);
 else if(mode==='production-payload')await payload();
 else throw Error('Usage: dm26ex5-images.mjs stage <archived-official-dir>|publish|verify-public|production-payload');
}
