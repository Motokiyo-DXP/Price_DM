import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch();
await mkdir('.local/rarity/browser',{recursive:true});
const report=[];
try {
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]) {
    const context=await browser.newContext({viewport,hasTouch:viewport.width<500,isMobile:viewport.width<500});
    const session=await(await fetch('http://127.0.0.1:55483/__session')).json();
    await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'localhost',path:'/',sameSite:'Lax'}]);
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.url().endsWith('/rpc/search_deck_cards_filtered'))requests.push(r.postDataJSON());});
    // Fixture art is intentionally local and synthetic; no image CDN is tested.
    await page.route('**/cards/**/*.webp',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="275" height="384"><rect width="275" height="384" fill="#334766"/></svg>'}));
    const latest=()=>requests.at(-1);
    const applied=async(key,value)=>expect.poll(()=>latest()?.[key]).toEqual(value);
    await page.goto('http://localhost:3000/decks/new',{waitUntil:'networkidle',timeout:120000});
    await page.getByRole('button',{name:'絞り込み',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'カードの絞り込み'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:'絞り込みを閉じる'})).toHaveCount(0);
    await expect(dialog.getByText('コストなしを含める')).toHaveCount(0);
    await expect(dialog.locator('details')).not.toHaveAttribute('open','');
    for(const name of ['最小パワー','最大パワー','カードテキスト'])await expect(dialog.getByRole('textbox',{name})).toBeVisible();
    const civil=await dialog.locator('.deck-civilization-buttons button').evaluateAll(els=>els.map(el=>({top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height})));
    expect(new Set(civil.map(x=>x.top)).size).toBe(1);expect(civil.every(x=>x.height>=42)).toBe(true);
    async function footerVisible() {
      await expect.poll(async()=>{
        const box=await dialog.locator('.deck-filter-footer').boundingBox();const size=page.viewportSize();
        return box.y>=0 && box.y+box.height<=size.height+1;
      }).toBe(true);
      expect(await dialog.locator('.deck-filter-fields').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    }
    await footerVisible();await page.screenshot({path:`.local/rarity/browser/${viewport.width}-collapsed.png`});
    await dialog.getByRole('button',{name:'火',exact:true}).click();await applied('p_civilizations',['fire']);
    await dialog.getByRole('button',{name:'∩ すべて'}).click();await applied('p_civilization_mode','cap');
    await dialog.getByRole('radio',{name:'多色のみ'}).check();await applied('p_color','multi');
    await dialog.getByRole('button',{name:'条件クリア'}).click();await applied('p_civilizations',[]);
    await dialog.getByRole('combobox',{name:'最小コスト'}).selectOption('0');await applied('p_min_cost',0);
    await expect(page.locator('.deck-result-strip')).not.toContainText('コストなし検証');
    await dialog.getByRole('combobox',{name:'最大コスト'}).selectOption('6');await applied('p_max_cost',6);
    await dialog.getByRole('button',{name:'条件クリア'}).click();await applied('p_min_cost',null);await applied('p_max_cost',null);
    await expect(page.locator('.deck-result-strip')).toContainText('コストなし検証');
    await dialog.getByRole('textbox',{name:'最小パワー'}).fill('4000');await applied('p_min_power',4000);
    await dialog.getByRole('textbox',{name:'最大パワー'}).fill('6000');await applied('p_max_power',6000);
    await dialog.locator('.deck-card-type-picker>button').click();await dialog.getByRole('button',{name:'呪文',exact:true}).click();await applied('p_card_types',['呪文']);
    await dialog.getByRole('button',{name:'種族を選択'}).click();
    const race=page.getByRole('dialog',{name:'種族の選択'});await race.getByRole('button',{name:'ドラゴン',exact:true}).click();await applied('p_race_tokens',['ドラゴン']);await race.getByRole('button',{name:'閉じる',exact:true}).click();
    await dialog.getByRole('textbox',{name:'カードテキスト'}).fill('革命');await applied('p_card_text_query','革命');
    await dialog.locator('summary').click();await dialog.getByRole('button',{name:'すべて',exact:true}).first().click();
    const product=page.getByRole('dialog',{name:'収録商品の選択'});await product.getByRole('button',{name:'商品A',exact:true}).click();await applied('p_product_name','商品A');await product.getByRole('button',{name:'閉じる',exact:true}).click();
    const rarities=dialog.locator('.deck-rarity-options');await rarities.getByRole('button',{name:'C',exact:true}).click();await rarities.getByRole('button',{name:'SR',exact:true}).click();await applied('p_rarities',['C','SR']);
    await dialog.getByRole('textbox',{name:'カード番号',exact:true}).fill('DM-01');await applied('p_card_number','DM-01');
    await footerVisible();await page.screenshot({path:`.local/rarity/browser/${viewport.width}-expanded.png`});
    await dialog.locator('summary').click();await expect(dialog.locator('summary')).toContainText('条件あり');
    await dialog.getByRole('button',{name:'閉じる',exact:true}).click();await expect(dialog).toHaveCount(0);
    await page.getByRole('button',{name:'絞り込み',exact:true}).click();await expect(dialog.locator('summary')).toContainText('条件あり');
    await dialog.locator('summary').click();await expect(rarities.getByRole('button',{name:'SR',exact:true})).toHaveAttribute('aria-pressed','true');
    await dialog.getByRole('button',{name:'条件クリア'}).click();await applied('p_rarities',[]);await applied('p_product_name',null);await applied('p_card_number',null);await applied('p_race_tokens',[]);await applied('p_card_text_query',null);await expect(dialog).toBeVisible();
    await expect(dialog.locator('summary')).not.toContainText('条件あり');
    if(viewport.width<500) {await page.setViewportSize({width:viewport.width,height:420});await footerVisible();await page.screenshot({path:`.local/rarity/browser/${viewport.width}-keyboard-height.png`});await page.setViewportSize(viewport);}
    await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
    const input=page.getByPlaceholder('カード名で検索');await input.fill('ヘブンズゲート');await applied('p_query','ヘブンズゲート');await input.fill('ヘブンズ ゲート');await applied('p_query','ヘブンズ ゲート');
    // An older request is deliberately held until the newer search has completed.
    let oldStarted=false;
    await page.route('**/rpc/search_deck_cards_filtered',async route=>{
      if(route.request().postDataJSON().p_query==='old-response') {
        oldStarted=true;await new Promise(r=>setTimeout(r,1000));
        await route.fulfill({json:[{id:100,name:'STALE RESPONSE',cost:1,civilizations:[],card_types:[]}]}).catch(()=>{});
      } else await route.continue();
    });
    await input.fill('old-response');await expect.poll(()=>oldStarted).toBe(true);await input.fill('ゲート');await applied('p_query','ゲート');
    await expect(page.locator('.deck-result-strip')).toContainText('ヘブンズ・ゲート');
    await page.waitForTimeout(1100);await expect(page.locator('.deck-result-strip')).not.toContainText('STALE RESPONSE');
    expect(errors).toEqual([]);report.push({viewport,status:'pass',checks:'auto apply all fields, rarity OR, details indicator/persistence, clear/close, cost boundary UI, raw whitespace AND, stale response, footer/scroll/viewport resize, civilization row',pageErrors:errors});
    await context.close();
  }
  await writeFile('.local/rarity/browser/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
