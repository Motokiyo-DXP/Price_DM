import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
const baseline=JSON.parse(await readFile('docs/dm26ex4-baseline-20261014.json','utf8'));
const manifest=JSON.parse(await readFile('scripts/dm26ex4-complete.json','utf8'));
const missing=baseline.cards.filter(c=>c.card_types.length===0||c.civilizations.length===0);
await mkdir('.local/dm26ex4-audit/images',{recursive:true});
const items=[];
for(const c of missing){
 const p=baseline.prints.find(p=>p.canonical_card_id===c.id&&/ \d+\/99$/.test(p.card_number))??baseline.prints.find(p=>p.canonical_card_id===c.id);
 const image=manifest.cards.find(x=>'DM26EX4 '+x.card_number===p.card_number)?.image;
 if(!image){console.log('No source',c.id);continue;}
 const r=await fetch(image.source_url);if(!r.ok)throw Error('Image fetch '+r.status);
 const path=`.local/dm26ex4-audit/images/${c.id}.jpg`;await writeFile(path,Buffer.from(await r.arrayBuffer()));
 items.push({id:c.id,name:c.name,number:p.card_number,path,url:image.source_url});
}
await writeFile('.local/dm26ex4-audit/image-index.json',JSON.stringify(items,null,2));
for(let i=0;i<items.length;i+=6){
 const group=items.slice(i,i+6),composite=[];
 for(let j=0;j<group.length;j++)composite.push({input:await sharp(group[j].path).resize(480,680,{fit:'contain',background:'white'}).toBuffer(),left:(j%3)*480,top:Math.floor(j/3)*680});
 await sharp({create:{width:1440,height:1360,channels:3,background:'white'}}).composite(composite).png().toFile(`.local/dm26ex4-audit/sheet-${i/6}.png`);
 console.log('Sheet',i/6,group.map(x=>x.id+':'+x.number).join(','));
}
