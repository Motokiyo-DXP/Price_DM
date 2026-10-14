import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {load} from 'cheerio';
import {parseWikiDetail,projectMetadata,PRODUCT_URL} from './dm26ex4-research.mjs';
const dir='.local/dm26ex4-audit';
await mkdir(dir,{recursive:true});
const baseline=JSON.parse(await readFile('docs/dm26ex4-baseline-20261014.json','utf8'));
async function get(url,file){
 try { const r=await fetch(url,{signal:AbortSignal.timeout(25000)}); const html=await r.text(); await writeFile(`${dir}/${file}`,html);return {url,status:r.status,html}; }
 catch(e){return {url,status:null,error:e.message};}
}
const product=await get(PRODUCT_URL,'product.html');
const search=await get('https://dm.takaratomy.co.jp/card/?products=26ex4&pagenum=1&samename=show','official-search.html');
const $=load(search.html??'');
const officialLinks=[...new Set($('a[href]').map((_,e)=>$(e).attr('href')).get().filter(s=>s.includes('/card/detail/')&&/dm26ex4/i.test(s)))];
const results=[];
for(const c of baseline.cards){
 const url='https://m.dmwiki.net/'+encodeURIComponent('《'+c.name+'》');
 const response=await get(url,`wiki-${c.id}.html`);
 const detail=response.status===200?parseWikiDetail(response.html,c.name,url):null;
 results.push({id:c.id,name:c.name,url,status:response.status,error:response.error,detail,metadata:detail?.matched?projectMetadata(detail):null});
 if(results.length%20===0)console.log(`Fetched ${results.length}/${baseline.cards.length}`);
 await writeFile(`${dir}/results.json`,JSON.stringify({checked_at:new Date().toISOString(),product:{url:product.url,status:product.status},official_search:{url:search.url,status:search.status,links:officialLinks},results},null,2));
 await new Promise(r=>setTimeout(r,750));
}
console.log(JSON.stringify({cards:results.length,matched:results.filter(r=>r.detail?.matched).length,metadata:results.filter(r=>r.metadata).length,officialLinks:officialLinks.length}));
