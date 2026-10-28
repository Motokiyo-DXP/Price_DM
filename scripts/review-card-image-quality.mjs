import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe } from "./audit-card-image-resolution.mjs";
// Diagnostic evidence only: low edge energy does NOT establish blur or trigger replacement.
const [input, baseUrl, output] = process.argv.slice(2);
if (!input || !baseUrl?.startsWith("https://") || !output) throw new Error("Usage: node scripts/review-card-image-quality.mjs input.json https://image-base output-dir");
const rows=JSON.parse(await readFile(input,"utf8"));
await mkdir(output,{recursive:true});
const manifest=[], layers=[];
for(const row of rows){
  const key=row.image_key.split("/");if(key.some(s=>!s||s==="."||s===".."))throw Error("Unsafe key");
  const url=`${baseUrl.replace(/\/$/,"")}/${key.map(encodeURIComponent).join("/")}.webp`;
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const actual=await describe(bytes);
  const edge=await sharp(bytes).greyscale().convolve({width:3,height:3,kernel:[0,1,0,1,-4,1,0,1,0],scale:1,offset:128}).stats();
  const image_file=`${row.print_id}.webp`;await writeFile(path.join(output,image_file),bytes);
  const index=manifest.length;
  layers.push({input:await sharp(bytes).resize({width:150,height:210,fit:"contain",background:"white"}).png().toBuffer(),left:(index%12)*150,top:Math.floor(index/12)*235});
  const label=Buffer.from(`<svg width="150" height="25"><rect width="150" height="25" fill="white"/><text x="3" y="17" font-size="13">${row.print_id} / ${edge.channels[0].stdev.toFixed(1)}</text></svg>`);
  layers.push({input:label,left:(index%12)*150,top:Math.floor(index/12)*235+210});
  manifest.push({...row,actual,url,image_file,edge_stdev:edge.channels[0].stdev,quality_review:"pending_visual_review_not_automated_blur_verdict"});
  await new Promise(resolve=>setTimeout(resolve,200));
}
await writeFile(path.join(output,"quality-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
await sharp({create:{width:1800,height:Math.ceil(rows.length/12)*235,channels:3,background:"white"}}).composite(layers).png().toFile(path.join(output,"contact-sheet.png"));
console.log(JSON.stringify({audited:manifest.length,automatic_replacements:0}));
