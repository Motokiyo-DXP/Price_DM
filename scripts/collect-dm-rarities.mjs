import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseRarityOptions, reconcileRarities } from './dm-rarity.mjs';
import { isAllowedByRobots, parseCardList } from './import-dm-cards-sample.mjs';

// Read-only collection. Cached official filtered results identify exact print IDs.
// No DB connection, credentials, or write mode exists in this command.
const directory = '.local/rarity';
await mkdir(directory, {recursive:true});
let lastRequest = 0;
async function fetchOfficial(url, body) {
  await new Promise(r => setTimeout(r, Math.max(0, lastRequest + 1000 - Date.now())));
  lastRequest = Date.now();
  const response = await fetch(url, {method:body?'POST':'GET',
    headers:{'user-agent':'TCG-Souba-Checker/0.1 (official rarity metadata; no images)',
      ...(body?{'content-type':'application/x-www-form-urlencoded'}:{})}, body,
    signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`Official HTTP ${response.status}; stopped without retry.`);
  return response.text();
}
const robots = await fetchOfficial('https://dm.takaratomy.co.jp/robots.txt');
if (!isAllowedByRobots(robots,'/card/')) throw Error('robots disallows card search');
const search = await fetchOfficial('https://dm.takaratomy.co.jp/card/');
const options = parseRarityOptions(search);
if (!options.length) throw Error('No official rarity options');
await writeFile(`${directory}/options.json`,JSON.stringify(options,null,2));
const memberships=[];
for (const option of options) {
  let seen=new Set(), total=null;
  for(let page=1;page<2000;page++) {
    const filename=`${directory}/${option.value}-${page}.json`;
    let record;
    try {record=JSON.parse(await readFile(filename,'utf8')); if(record.ids.some(id=>/\s/u.test(id))) { const e=Error('Legacy plus decoding');e.code='ENOENT';throw e; }}
    catch(error) {
      if(error.code!=='ENOENT') throw error;
      const body = new URLSearchParams({rarity:option.value,pagenum:String(page),samename:'show',sort:'release_new'}).toString();
      const html = await fetchOfficial('https://dm.takaratomy.co.jp/card/',body);
      const parsed=parseCardList(html);
      record={checked_at:new Date().toISOString(),url:'https://dm.takaratomy.co.jp/card/',body,
        sha256:createHash('sha256').update(html).digest('hex'),total:parsed.totalAvailable,
        ids:parsed.detailUrls.map(url=>decodeURIComponent(new URL(url).search.match(/[?&]id=([^&]+)/u)[1]))};
      await writeFile(filename,JSON.stringify(record));
    }
    if(total!==null && record.total!==total) throw Error('Official total changed during pagination');
    total=record.total;
    const newIds=record.ids.filter(id=>!seen.has(id));
    if(!newIds.length && seen.size<total) throw Error('Pagination repeated or ended before total');
    for(const id of newIds) {seen.add(id);memberships.push({official_card_id:id,rarity:option.rarity,source_file:filename,...record,ids:undefined});}
    if(seen.size>=total) break;
  }
  console.log(`${option.rarity}: ${seen.size}/${total}`);
}
const snapshot=JSON.parse(await readFile('.local/rarity-prints-before.json','utf8'));
const rows=reconcileRarities(snapshot.prints,memberships);
const reasons={};for(const row of rows)if(row.reason)reasons[row.reason]=(reasons[row.reason]??0)+1;
const report={checked_at:new Date().toISOString(),snapshot_at:snapshot.checked_at,total:rows.length,
  verified:rows.filter(r=>r.rarity_codes).length,unverified:rows.filter(r=>!r.rarity_codes).length,reasons,rows};
await writeFile(`${directory}/reconciliation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined}));
