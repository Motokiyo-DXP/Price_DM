import{readFile,writeFile}from'node:fs/promises';
import{parseCardDetail}from'./import-dm-cards-sample.mjs';
const rows=JSON.parse(await readFile('docs/dm26ex4-existing-official-sources.json','utf8')),results=[];
for(const row of rows){
 try{const r=await fetch(row.official_url,{signal:AbortSignal.timeout(25000)}),h=await r.text();await writeFile(`.local/dm26ex4-audit/official-${row.id}.html`,h);results.push({...row,status:r.status,metadata:r.ok?parseCardDetail(h,row.official_url):null});}
 catch(e){results.push({...row,error:e.message});}
 if(results.length%10===0)console.log('Official',results.length+'/'+rows.length);
 await writeFile('.local/dm26ex4-audit/official-existing.json',JSON.stringify(results,null,2));
 await new Promise(r=>setTimeout(r,750));
}
