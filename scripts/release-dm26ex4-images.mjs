import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {assertProductionDbRelease} from './production-db-guard.mjs';
import {validateComplete} from './build-dm26ex4-complete.mjs';

// Dedicated release only. Immutable content-addressed objects are never replaced
// unless a public GET already proves their bytes identical to the staged WebP.
assertProductionDbRelease(process.cwd());
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Usage: release-dm26ex4-images.mjs staged-webp-dir proof.json');
const manifest=JSON.parse(await fs.readFile('scripts/dm26ex4-complete.json','utf8'));
validateComplete(manifest);
const cards=manifest.cards.filter(c=>c.image),proofs=[];
for(const c of cards){
 const i=c.image,file=path.resolve(directory,i.key.split('/').pop()+'.webp'),bytes=await fs.readFile(file);
 if(createHash('sha256').update(bytes).digest('hex')!==i.sha256)throw Error('Staged image hash differs: '+i.key);
 await sharp(bytes).metadata();
}
for(const c of cards){
 const i=c.image,url=`https://dm-price-tracker-card-images.tcg-price-checker.workers.dev/${i.key}.webp`;
 let response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(response.status===404){
  const file=path.resolve(directory,i.key.split('/').pop()+'.webp');
  const args=['--yes','wrangler@4.38.0','r2','object','put','dm-price-tracker-card-images/'+i.key+'.webp','--file',file,'--content-type','image/webp','--cache-control','public,max-age=31536000,immutable','--remote','--config','cloudflare/card-images/wrangler.jsonc'];
  const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',args,{shell:process.platform==='win32',encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error('R2 upload failed for '+i.key+': '+(result.stderr||result.stdout).slice(-600));
  response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 }
 if(response.status!==200)throw Error('Public image GET failed: '+i.key+' '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==i.sha256)throw Error('Existing R2 object differs; refusing overwrite: '+i.key);
 const info=await sharp(bytes).metadata();await sharp(bytes).raw().toBuffer();
 if(info.format!=='webp')throw Error('Unexpected image format');
 proofs.push({key:i.key,url,status:200,sha256,decoded:true,width:info.width,height:info.height,checked_at:new Date().toISOString()});
 await fs.writeFile(output,JSON.stringify(proofs,null,2)+'\n');
 if(proofs.length%10===0||proofs.length===cards.length)console.log('R2 and public WebP verified '+proofs.length+'/'+cards.length);
}
