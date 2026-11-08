// Read-only production rendering check. No user session or deck mutation.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {validate,bundle,publicBase} from './dm26ex5-images.mjs';
const m=validate(JSON.parse(await fs.readFile(bundle+'/manifest.json','utf8')));
const base=process.argv[2]||'https://dm-price-tracker.vercel.app';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(base+'/cards/44114',{waitUntil:'networkidle',timeout:60000});
 if(response.status()!==200||!page.url().includes('/cards/44114'))throw Error('public card route inaccessible: '+page.url());
 const art=page.locator('img[alt="龍聖霊マギア・デル・フィン"]').first();await art.waitFor();
 await art.evaluate(async e=>{await e.decode();if(e.naturalWidth!==384)throw Error('missing artwork');});
 const rendered=await art.evaluate(e=>({src:e.currentSrc,width:e.naturalWidth,height:e.naturalHeight,complete:e.complete}));
 if(!m.rows.some(r=>r.canonical_id===44114&&rendered.src===publicBase+'/'+r.image_key+'.webp'))throw Error('rendered Magia not in approved image manifest');
 await page.screenshot({path:'.local/ex5-images-magia-production.png',fullPage:true});
 const images=await page.evaluate(async rows=>{
  const out=[];
  for(let i=0;i<rows.length;i+=8)await Promise.all(rows.slice(i,i+8).map(async r=>{const image=new Image();image.src=r.url;try{await image.decode();out.push({official_id:r.id,width:image.naturalWidth,height:image.naturalHeight,ok:image.naturalWidth===r.width&&image.naturalHeight===r.height});}catch{out.push({official_id:r.id,ok:false});}}));
  return out;
 },m.rows.map(r=>({id:r.official_id,url:publicBase+'/'+r.image_key+'.webp',width:r.width,height:r.height})));
 if(images.length!==115||images.some(r=>!r.ok)||errors.length)throw Error('browser image decode or page errors: '+JSON.stringify({images:images.filter(r=>!r.ok),errors}));
 const report={url:page.url(),viewport:'390x844',rendered,decoded_images:images.length,page_errors:errors,scope:'public card detail actual UI + all 115 public image browser decodes; no authenticated deck editor session'};
 await fs.writeFile('.local/ex5-images-browser-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
