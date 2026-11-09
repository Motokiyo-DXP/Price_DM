import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {parseOfficialRarities} from './dm-rarity.mjs';
import {isAllowedByRobots} from './import-dm-cards-sample.mjs';
const dir='.local/rarity/detail';await mkdir(dir,{recursive:true});
const response=await fetch('https://dm.takaratomy.co.jp/robots.txt');if(!response.ok)throw Error('robots unavailable');
if(!isAllowedByRobots(await response.text(),'/card/detail/'))throw Error('robots disallows detail');
const report=JSON.parse(await readFile('.local/rarity/reconciliation.json','utf8'));
for(const [i,row] of report.rows.filter(r=>r.reason && r.official_card_id).entries()) {
  const file=`${dir}/${encodeURIComponent(row.official_card_id)}.json`;
  let record;
  try {record=JSON.parse(await readFile(file,'utf8'));if(!Object.hasOwn(record,'rarity_codes')) {const e=Error('old cache shape');e.code='ENOENT';throw e;}}
  catch(e) {
    if(e.code!=='ENOENT')throw e;
    const url='https://dm.takaratomy.co.jp/card/detail/?id='+encodeURIComponent(row.official_card_id);
    await new Promise(r=>setTimeout(r,1000));
    const response=await fetch(url,{headers:{'user-agent':'TCG-Souba-Checker/0.1 (rarity metadata; no images)'},signal:AbortSignal.timeout(30000)});
    if([403,429].includes(response.status)||response.status>=500)throw Error(`HTTP ${response.status}: stopped`);
    const html=await response.text(),$=load(html);
    const number=$('.card-name .packname').first().text().trim().replace(/^\(/u,'').replace(/\)$/u,'');
    record={official_card_id:row.official_card_id,url,checked_at:new Date().toISOString(),status:response.status,
      card_number:number,rarity_codes:response.ok?parseOfficialRarities(html):null,sha256:createHash('sha256').update(html).digest('hex')};
    await writeFile(file,JSON.stringify(record));
  }
  if(record.rarity_codes && record.card_number===row.card_number) {
    row.rarity_codes=record.rarity_codes;row.reason=null;row.evidence={...record,body:'detail',source_file:file};
  } else row.reason=!record.card_number?'official_detail_unavailable':record.card_number!==row.card_number?'official_number_mismatch':'absent_face_rarity';
  if(i%25===0)console.log(`Detail ${i+1}`);
}
report.reasons={};for(const row of report.rows)if(row.reason)report.reasons[row.reason]=(report.reasons[row.reason]??0)+1;
report.verified=report.rows.filter(r=>r.rarity_codes).length;report.unverified=report.total-report.verified;
report.checked_at=new Date().toISOString();await writeFile('.local/rarity/reconciliation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined}));
