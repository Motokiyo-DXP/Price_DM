import { test, expect, chromium } from "@playwright/test";

const fixture = "http://127.0.0.1:55441";
async function login(context, identity) {
  const session = await (await context.request.get(`${fixture}/__session/${identity}`)).json();
  await context.addCookies([{name:"sb-127-auth-token",value:`base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,domain:"localhost",path:"/",sameSite:"Lax"}]);
  return session;
}
async function rpc(request, session, name, args={}) {
  const response = await request.post(`${fixture}/rest/v1/rpc/${name}`,{headers:{Authorization:`Bearer ${session.access_token}`},data:args});
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function artwork(context) {
  // Synthetic art exercises the audited orientation key, dimensions and fallback.
  await context.route("**/cards/**/*.webp",async route=>{
    const landscape=route.request().url().includes("dm22bd1-004");
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${landscape?384:275}" height="${landscape?275:384}"><rect width="100%" height="100%" fill="#1c3760"/><rect x="12" y="12" width="80%" height="80%" fill="#f3c800"/><text x="25" y="100" font-size="24">TEST ART</text></svg>`;
    await route.fulfill({contentType:"image/svg+xml",body:svg});
  });
}
test.beforeEach(async({request})=>{await request.post(`${fixture}/__reset`);});

for(const mobile of [false,true]) {
  test(`${mobile?"mobile touch":"desktop keyboard"}: home image modal preserves query, sort, focus, scroll and rotation`,async({browser})=>{
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});
    await artwork(context);
    const page=await context.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/");
    await page.getByRole("textbox",{name:"カード検索",exact:true}).fill("テスト");
    await page.getByRole("combobox",{name:"カードの並び替え"}).selectOption("release-date");
    await expect(page.getByRole("button",{name:"テスト価格未登録カードの画像を拡大"})).toBeVisible();
    for(const name of ["テスト価格登録カード","テスト価格未登録カード","テスト画像未登録カード"]) {
      const button=page.getByRole("button",{name:`${name}の画像を拡大`,exact:true});
      await button.scrollIntoViewIfNeeded(); const scroll=await page.evaluate(()=>scrollY);
      if(mobile) await button.tap(); else {await button.focus(); await page.keyboard.press("Enter");}
      const dialog=page.getByRole("dialog"); await expect(dialog).toBeVisible();
      const box=await dialog.locator(".card-artwork").boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(mobile?390:1280);expect(box.y+box.height).toBeLessThanOrEqual(mobile?844:900);
      await expect(dialog.getByRole("button",{name:"拡大画像を閉じる"})).toBeFocused();
      const closeBox=await dialog.getByRole("button",{name:"拡大画像を閉じる"}).boundingBox();
      expect(closeBox.y).toBeGreaterThanOrEqual(0);
      expect(closeBox.y+closeBox.height).toBeLessThanOrEqual(mobile?844:900);
      await page.keyboard.press("Tab");
      expect(await page.evaluate(()=>document.querySelector("dialog").contains(document.activeElement))).toBe(true);
      if(name==="テスト価格登録カード") {
        await expect(dialog.locator(".card-artwork")).toHaveAttribute("data-artwork-rotation","90");
        await expect(dialog.locator("foreignObject")).toHaveAttribute("transform","translate(275 0) rotate(90)");
        await page.screenshot({path:`.local/shopping-${mobile?"mobile":"desktop"}-modal.png`});
        await page.keyboard.press("Escape");
      } else if(name==="テスト価格未登録カード") await dialog.click({position:{x:5,y:5}});
      else { await expect(dialog.locator(".card-artwork-placeholder")).toBeVisible();await dialog.getByRole("button",{name:"拡大画像を閉じる"}).click(); }
      await expect(dialog).toHaveCount(0);await expect(button).toBeFocused();
      expect(await page.evaluate(()=>scrollY)).toBe(scroll);
      await expect(page).toHaveURL("http://localhost:3000/");
      await expect(page.getByRole("textbox",{name:"カード検索",exact:true})).toHaveValue("テスト");
      await expect(page.getByRole("combobox",{name:"カードの並び替え"})).toHaveValue("release-date");
    }
    expect(errors).toEqual([]);await context.close();
  });
  test(`${mobile?"mobile":"desktop"}: registration image preserves form input`,async({browser})=>{
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});
    await login(context,"owner");await artwork(context);const page=await context.newPage();
    await page.goto("/register?cardId=1");
    const button=page.getByRole("button",{name:"テスト価格登録カードの画像を拡大"});await expect(button).toBeVisible();
    await page.locator("#salePrice").fill("1234");await page.locator("#buyPrice").fill("567");
    if(mobile) await button.tap();else await button.click();
    await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("button",{name:"拡大画像を閉じる"}).click();
    await expect(page.locator("#salePrice")).toHaveValue("1234");await expect(page.locator("#buyPrice")).toHaveValue("567");
    await expect(page).toHaveURL(/register\?cardId=1$/);await context.close();
  });
}
test("valid unpriced card detail renders; nonexistent ID is Not Found",async({page})=>{
  const response=await page.goto("/cards/2");expect(response.status()).toBe(200);
  await expect(page.getByRole("heading",{name:"テスト価格未登録カード"})).toBeVisible();
  await expect(page.getByText("価格登録はまだありません。",{exact:true})).toHaveCount(1);
  await page.goto("/cards/999999");await expect(page.getByRole("heading",{name:"カード相場が見つかりません"})).toBeVisible();
});

test("two independent browsers: friend/URL permissions, live favorite add/remove/clear, reconnect and revocation",async({browser,request})=>{
  const secondBrowser=await chromium.launch();
  const ownerContext=await browser.newContext();const friendContext=await browser.newContext();const anonymous=await secondBrowser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const deniedContext=await browser.newContext();
  const ownerSession=await login(ownerContext,"owner");await login(friendContext,"friend");await login(deniedContext,"stranger");
  const ownerPage=await ownerContext.newPage(),friendPage=await friendContext.newPage(),urlPage=await anonymous.newPage(),denied=await deniedContext.newPage();
  await ownerPage.goto("/shopping-list");await ownerPage.getByText("共有",{exact:true}).click();
  await expect(ownerPage.getByRole("heading",{name:"URLで共有：無効"})).toBeVisible();
  const friendCheck=ownerPage.getByRole("checkbox",{name:/テストフレンド/});await friendCheck.click();await expect(friendCheck).toBeChecked();
  await friendPage.goto("/shopping-list");const shared=friendPage.getByRole("link",{name:"所有者の買い物リスト"});await expect(shared).toBeVisible();
  const friendUrl=await shared.getAttribute("href");await shared.click();
  await expect(friendPage.getByText("共有リスト（閲覧専用）")).toBeVisible();await expect(friendPage.locator(".shopping-card")).toHaveCount(2);
  await expect(friendPage.getByRole("button",{name:/買い物リストから削除/})).toHaveCount(0);
  await denied.goto(friendUrl);await expect(denied.getByRole("status")).toContainText("閲覧できません");
  await ownerPage.getByRole("button",{name:"URLで共有を有効にする"}).click();
  const urlInput=ownerPage.getByRole("textbox",{name:"共有URL",exact:true});await expect(urlInput).toHaveValue(/shared\/[a-f0-9]{64}$/);
  const shareUrl=await urlInput.inputValue();
  await ownerContext.grantPermissions(["clipboard-read","clipboard-write"],{origin:"http://localhost:3000"});
  await ownerPage.getByRole("button",{name:"URLをコピー",exact:true}).click();
  expect(await ownerPage.evaluate(()=>navigator.clipboard.readText())).toBe(shareUrl);
  await urlPage.goto(shareUrl);await expect(urlPage.locator(".shopping-card")).toHaveCount(2);
  await expect(urlPage.getByRole("button",{name:/買い物リストから削除/})).toHaveCount(0);
  await expect(urlPage.getByRole("heading",{name:"販売価格未登録"})).toBeVisible();
  await expect(urlPage.locator(".shopping-card-priced").getByText("100円",{exact:true}).first()).toBeVisible();
  await urlPage.getByRole("button",{name:"買取",exact:true}).click();
  await expect(urlPage.getByRole("heading",{name:"店舗B",exact:true})).toBeVisible();await expect(urlPage.getByText("最高買取",{exact:true})).toBeVisible();
  const home=await ownerContext.newPage();await home.goto("/");
  await home.getByRole("button",{name:"テスト画像未登録カードを買い物リストへ追加",exact:true}).click();
  await expect(friendPage.locator(".shopping-card")).toHaveCount(3);await expect(urlPage.locator(".shopping-card")).toHaveCount(3);
  await home.getByRole("button",{name:"テスト価格未登録カードを買い物リストから削除",exact:true}).click();
  await expect(friendPage.locator(".shopping-card")).toHaveCount(2);await expect(urlPage.locator(".shopping-card")).toHaveCount(2);
  await anonymous.setOffline(true);await expect(urlPage.locator(".shopping-card")).toHaveCount(0);
  await home.getByRole("button",{name:"テスト価格未登録カードを買い物リストへ追加",exact:true}).click();
  await anonymous.setOffline(false);await expect(urlPage.locator(".shopping-card")).toHaveCount(3);
  ownerPage.on("dialog",dialog=>dialog.accept());await ownerPage.getByRole("button",{name:"買い物リストを全件解除",exact:true}).click();
  await expect(friendPage.locator(".shopping-card")).toHaveCount(0);await expect(urlPage.locator(".shopping-card")).toHaveCount(0);
  await ownerPage.getByRole("button",{name:"URL共有を停止",exact:true}).click();await expect(urlPage.getByRole("status")).toContainText("閲覧できません");
  await urlPage.reload();await expect(urlPage.getByRole("status")).toContainText("閲覧できません");
  await friendCheck.click();await expect(friendCheck).not.toBeChecked();await expect(friendPage.getByRole("status")).toContainText("閲覧できません");
  // Browser-side attempts still hit the unchanged owner-only database RLS.
  const friendSession=await (await request.get(`${fixture}/__session/friend`)).json();
  const attack=await request.post(`${fixture}/rest/v1/account_card_bookmarks`,{headers:{Authorization:`Bearer ${friendSession.access_token}`},data:{user_id:ownerSession.user.id,canonical_card_id:1}});
  expect(attack.status()).toBe(403);
  await Promise.all([ownerContext.close(),friendContext.close(),anonymous.close(),deniedContext.close()]);await secondBrowser.close();
});
