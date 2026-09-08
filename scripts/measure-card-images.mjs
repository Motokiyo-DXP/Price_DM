import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/mossa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.BENCH_BASE || "http://127.0.0.1:3001";
const browser = await chromium.launch({channel:"msedge",headless:true});
const results = [];
async function instrument(context) {
 await context.addInitScript(() => {
   window.__imageSamples = [];
   window.__measureStart = 0;
   const observed = new WeakSet();
   function scan() {
     document.querySelectorAll(".card-artwork img").forEach(img => {
       if(observed.has(img)) return; observed.add(img);
       const inserted = performance.now();
       const done = async () => {
         if(!img.naturalWidth) return;
         await img.decode().catch(()=>{});
         requestAnimationFrame(()=>requestAnimationFrame(()=>{
           const box=img.closest(".card-artwork").getBoundingClientRect();
           window.__imageSamples.push({name:img.alt,src:img.currentSrc,inserted,ready:performance.now(),width:img.naturalWidth,height:img.naturalHeight,displayWidth:box.width,visible:box.width>0&&box.height>0&&box.top<innerHeight&&box.bottom>0});
         }));
       };
       if(img.complete) done(); else img.addEventListener("load",done,{once:true});
     });
   }
   new MutationObserver(scan).observe(document,{childList:true,subtree:true});
   document.addEventListener("DOMContentLoaded",scan);
 });
}
async function collect(page, label, meta) {
 const value=await page.evaluate(()=>{
   const start=window.__measureStart||0;
   const samples=(window.__imageSamples||[]).filter(s=>s.ready>=start);
   const nav=performance.getEntriesByType("navigation")[0];
   const images=performance.getEntriesByType("resource").filter(r=>/\.webp(?:\?|$)|card-back\.svg/.test(r.name)&&r.startTime>=start);
   const api=performance.getEntriesByType("resource").filter(r=>/\/rest\/|\/api\//.test(r.name)&&r.startTime>=start).map(r=>({path:new URL(r.name).pathname,start:r.startTime-start,duration:r.duration}));
   const visibleSources=new Set(Array.from(document.querySelectorAll(".card-artwork img")).filter(img=>{
     const box=img.closest(".card-artwork")?.getBoundingClientRect();
     return box&&box.width>0&&box.height>0&&box.top<innerHeight&&box.bottom>0;
   }).map(img=>img.currentSrc));
   const visible=samples.filter(s=>visibleSources.has(s.src) && new URL(s.src).pathname.endsWith('.webp'));
   return {url:location.pathname,ttfb:nav?.responseStart,firstImage:visible.length?Math.min(...visible.map(s=>s.ready))-start:null,visibleReady:visible.length?Math.max(...visible.map(s=>s.ready))-start:null,sampleCount:samples.length,visibleCount:visible.length,uniqueImages:new Set(images.map(r=>r.name)).size,requests:images.length,transferBytes:images.reduce((s,r)=>s+r.transferSize,0),imageDurationMax:Math.max(0,...images.map(r=>r.duration)),samples:samples.map(s=>({...s,src:new URL(s.src).pathname,ready:s.ready-start,inserted:s.inserted-start})),api};
 });
 results.push({label,...meta,...value}); console.log(JSON.stringify({label,...meta,firstImage:value.firstImage,visibleReady:value.visibleReady,images:value.sampleCount,ttfb:value.ttfb}));
}
try {
 // Warm route compilation before collecting browser-cache measurements.
 const warm = await browser.newPage();
 for(const path of ["/","/image-preview","/cards/4","/register","/decks/new","/shopping-list"]) await warm.goto(base+path,{waitUntil:"domcontentloaded",timeout:60000});
 await warm.close();
 for(const device of [{name:"desktop",width:1440,height:1000},{name:"mobile",width:390,height:844}]) {
  for(let run=1;run<=3;run++){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.name==="mobile"?3:1});
   await instrument(context); const page=await context.newPage();
   for(const [label,path] of [["market","/"],["image-preview","/image-preview"]]){
    for(const cache of ["cold","warm"]){
     if(cache==="cold"){const cdp=await context.newCDPSession(page);await cdp.send("Network.clearBrowserCache");await cdp.detach();}
     await page.goto(base+path,{waitUntil:"load",timeout:60000});
     await page.waitForFunction(()=>window.__imageSamples?.some(s=>s.visible),undefined,{timeout:15000}).catch(()=>{});
     await page.waitForTimeout(1200);
     await collect(page,label,{device:device.name,run,cache});
    }
   }
   await page.goto(base+"/",{waitUntil:"load",timeout:60000});
   const input=page.getByPlaceholder("カード名を入力");
   for(const query of ["デドダム","ドラゴン"]){
    await page.evaluate(()=>{window.__measureStart=performance.now();window.__imageSamples=[];});
    await input.fill(query);
    await page.waitForTimeout(5000);
    await collect(page,"market-search:"+query,{device:device.name,run,cache:"shared-session"});
   }
   await context.close();
  }
 }
 const page=await browser.newPage();
 for(const path of ["/register","/cards/4","/decks","/decks/new","/shopping-list","/rooms"]){
  const started=Date.now(); await page.goto(base+path,{waitUntil:"load",timeout:60000});
  results.push({label:"access-check",path,finalPath:new URL(page.url()).pathname,loadMs:Date.now()-started,cardImageCount:await page.locator(".card-artwork").count()});
 }
} finally {
 mkdirSync("outputs/image-performance",{recursive:true});
 writeFileSync(process.env.BENCH_OUTPUT || "outputs/image-performance/baseline.json",JSON.stringify({at:new Date().toISOString(),base,conditions:"local dev server; server routes precompiled; desktop browser; mobile viewport only, not real phone or network throttling; ready = image decode + two animation frames (paint proxy); cold clears browser HTTP cache only",results},null,2));
 await browser.close();
}
