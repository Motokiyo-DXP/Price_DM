import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import sharp from'sharp';
const baseline=JSON.parse(await readFile('docs/dm26ex4-baseline-20261014.json','utf8')),manifest=JSON.parse(await readFile('scripts/dm26ex4-complete.json','utf8')),results=[];
for(const p of baseline.prints){
 if(!p.image_key){results.push({id:p.id,number:p.card_number,status:'unavailable'});continue;}
 const expected=manifest.cards.find(c=>'DM26EX4 '+c.card_number===p.card_number)?.image;
 const url=`https://dm-price-tracker-card-images.tcg-price-checker.workers.dev/${p.image_key}.webp`;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)}),buf=Buffer.from(await r.arrayBuffer()),sha256=createHash('sha256').update(buf).digest('hex');await sharp(buf).raw().toBuffer();results.push({id:p.id,number:p.card_number,url,status:r.status,decoded:true,sha256,identity_matches:expected?.key===p.image_key&&expected.sha256===sha256});}
 catch(e){results.push({id:p.id,number:p.card_number,url,status:'error',error:e.message});}
 if(results.length%30===0)console.log('Images',results.length+'/'+baseline.prints.length);
 await writeFile('.local/dm26ex4-audit/public-images.json',JSON.stringify(results,null,2));
}
console.log(JSON.stringify({verified:results.filter(r=>r.status===200&&r.decoded&&r.identity_matches).length,unavailable:results.filter(r=>r.status==='unavailable').length,failed:results.filter(r=>r.status!=='unavailable'&&!(r.status===200&&r.decoded&&r.identity_matches)).length}));
