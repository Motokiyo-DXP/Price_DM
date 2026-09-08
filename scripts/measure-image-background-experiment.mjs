import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {chromium}=require("C:/Users/mossa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({channel:"msedge",headless:true});
const results=[];
try {
 for(let run=1;run<=3;run++) for(const disableBackground of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3});
  const page=await context.newPage();
  await page.goto("http://127.0.0.1:3001/",{waitUntil:"load"});
  if(disableBackground) await page.addStyleTag({content:".market-shell .card-artwork{background-image:none!important}"});
  const cdp=await context.newCDPSession(page);await cdp.send("Network.clearBrowserCache");
  await page.evaluate(()=>{
    window.__records=[]; window.__start=performance.now();
    const seen=new WeakSet();
    new MutationObserver(()=>{
      document.querySelectorAll(".card-artwork img").forEach(img=>{
        if(seen.has(img))return;seen.add(img);
        const done=async()=>{
          if(!img.naturalWidth)return;await img.decode().catch(()=>{});
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const b=img.getBoundingClientRect();
            if(b.top<innerHeight&&b.bottom>0&&b.width>0)window.__records.push(performance.now()-window.__start);
          }));
        };if(img.complete)done();else img.addEventListener("load",done,{once:true});
      });
    }).observe(document,{childList:true,subtree:true});
  });
  await page.getByPlaceholder("カード名を入力").fill("ドラゴン");
  await page.waitForTimeout(5000);
  const data=await page.evaluate(()=>({firstImage:Math.min(...window.__records),requests:performance.getEntriesByType("resource").filter(r=>r.startTime>=window.__start&&r.name.includes(".webp")).length,visibleReady:Math.max(...window.__records)}));
  results.push({run,disableBackground,...data});console.log(JSON.stringify(results.at(-1)));
  await context.close();
 }
}finally{writeFileSync("outputs/image-performance/background-experiment.json",JSON.stringify(results,null,2));await browser.close();}
