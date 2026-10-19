import fs from "node:fs/promises";
import {test,expect,chromium} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

// Explicit opt-in: the fixture suite must never claim real Auth verification.
test.skip(!process.env.SHOPPING_CLOUD_STATE,"Requires a dedicated, synthetic-data-only Supabase project");
let state;
const baseURL=process.env.SHOPPING_CLOUD_BASE_URL || "http://127.0.0.1:3000";
test.beforeAll(async()=>{
  state=JSON.parse(await fs.readFile(process.env.SHOPPING_CLOUD_STATE,"utf8"));
  if(state.ref==="fxhlobydispnbywxhirn" || !state.url.includes(state.ref))throw Error("Production forbidden");
  if(new URL(baseURL).hostname==="dm-price-tracker.vercel.app")throw Error("Cloud suite cannot target Production");
});
const ok=result=>{expect(result.error?.message??null).toBeNull();return result.data;};
async function signed(role){
  const db=createClient(state.url,state.publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const data=ok(await db.auth.signInWithPassword({email:state.users[role].email,password:state.users[role].password}));
  return {db,session:data.session};
}
async function login(context,role){
  const signedIn=await signed(role);
  const encoded=`base64-${Buffer.from(JSON.stringify(signedIn.session)).toString("base64url")}`;
  const name=`sb-${state.ref}-auth-token`;
  const chunks=encoded.match(/.{1,3000}/g);
  await context.addCookies(chunks.map((value,i)=>({name:chunks.length===1?name:`${name}.${i}`,value,domain:new URL(baseURL).hostname,path:"/",sameSite:"Lax",secure:baseURL.startsWith("https:")})));
  return signedIn;
}
async function reset(owner){
  ok(await owner.from("account_card_bookmarks").delete().eq("user_id",state.users.owner.id));
  ok(await owner.from("account_card_bookmarks").insert(state.cards.slice(0,2).map(card=>({user_id:state.users.owner.id,canonical_card_id:card.id}))));
  ok(await owner.rpc("set_shopping_url",{p_enabled:false}));
  ok(await owner.rpc("set_shopping_friend",{p_reader:state.users.friend.id,p_enabled:false}));
}

test("real Supabase Auth, owner/friend/stranger/anonymous RLS and URL revocation",async()=>{
  const {db:owner}=await signed("owner"),{db:friend}=await signed("friend"),{db:stranger}=await signed("stranger");
  const anon=createClient(state.url,state.publicKey,{auth:{persistSession:false}});
  await reset(owner);
  expect(ok(await owner.rpc("read_shopping_list")).sort()).toEqual(state.cards.slice(0,2).map(c=>c.id).sort());
  expect(ok(await friend.rpc("shared_shopping_lists"))).toEqual([]);
  expect((await anon.rpc("read_shopping_list")).error).toBeTruthy();
  ok(await owner.rpc("set_shopping_friend",{p_reader:state.users.friend.id,p_enabled:true}));
  const list=ok(await friend.rpc("shared_shopping_lists"))[0];expect(list.share_id).toBeTruthy();
  expect(ok(await friend.rpc("read_shopping_list",{p_share_id:list.share_id}))).toHaveLength(2);
  for(const db of [anon,stranger])expect((await db.rpc("read_shopping_list",{p_share_id:list.share_id})).error?.code).toBe("42501");
  expect(ok(await friend.from("account_card_bookmarks").delete().eq("user_id",state.users.owner.id).select())).toEqual([]);
  expect((await friend.from("account_card_bookmarks").insert({user_id:state.users.owner.id,canonical_card_id:state.cards[2].id})).error?.code).toBe("42501");
  expect((await friend.schema("private").from("shopping_list_shares").select()).error).toBeTruthy();
  const token=ok(await owner.rpc("set_shopping_url",{p_enabled:true}));expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(ok(await anon.rpc("read_shopping_list",{p_token:token}))).toHaveLength(2);
  ok(await owner.rpc("set_shopping_url",{p_enabled:false}));
  expect((await anon.rpc("read_shopping_list",{p_token:token})).error?.code).toBe("42501");
  const replacement=ok(await owner.rpc("set_shopping_url",{p_enabled:true}));expect(replacement).not.toBe(token);
  expect((await anon.rpc("read_shopping_list",{p_token:token})).error?.code).toBe("42501");
  ok(await owner.rpc("set_shopping_friend",{p_reader:state.users.friend.id,p_enabled:false}));
  expect((await friend.rpc("read_shopping_list",{p_share_id:list.share_id})).error?.code).toBe("42501");
  expect(ok(await owner.rpc("list_my_friends")).some(f=>f.friend_user_id===state.users.friend.id)).toBe(true);
  expect(ok(await owner.rpc("get_my_friend_code"))).toBeTruthy();
  const deck=ok(await owner.from("decks").insert({owner_id:state.users.owner.id,name:"共有機能回帰確認",visibility:"private"}).select("id").single());
  expect(ok(await stranger.from("decks").select("id").eq("id",deck.id))).toEqual([]);
  ok(await owner.from("decks").delete().eq("id",deck.id));
});

test("real signed-out JWT replay is denied for friend read and share mutation",async()=>{
  const {db:owner}=await signed("owner"),{db:friend,session}=await signed("friend");
  ok(await owner.rpc("set_shopping_friend",{p_reader:state.users.friend.id,p_enabled:true}));
  const list=ok(await friend.rpc("shared_shopping_lists"))[0];
  ok(await friend.auth.signOut({scope:"global"}));
  const replay=createClient(state.url,state.publicKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${session.access_token}`}}});
  expect((await replay.rpc("read_shopping_list",{p_share_id:list.share_id})).error?.code).toBe("42501");
  expect((await replay.rpc("set_shopping_url",{p_enabled:true})).error?.code).toBe("42501");
});

test("two browser processes on real Supabase: sync, disconnect, revoke and logout",async({browser})=>{
  const second=await chromium.launch();const ownerContext=await browser.newContext(),friendContext=await browser.newContext();
  const anonContext=await second.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    const {db:owner}=await login(ownerContext,"owner");const {db:friend}=await login(friendContext,"friend");await reset(owner);
    const ownerPage=await ownerContext.newPage(),friendPage=await friendContext.newPage(),urlPage=await anonContext.newPage();
    await ownerPage.goto("/shopping-list");await ownerPage.getByText("共有",{exact:true}).click();
    const checkbox=ownerPage.getByRole("checkbox",{name:/検証friend/});await checkbox.click();await expect(checkbox).toBeChecked();
    await friendPage.goto("/shopping-list");await friendPage.getByRole("link",{name:"検証ownerの買い物リスト"}).click();
    await expect(friendPage.locator(".shopping-card")).toHaveCount(2);
    await ownerPage.getByRole("button",{name:"URLで共有を有効にする"}).click();
    const urlInput=ownerPage.getByRole("textbox",{name:"共有URL",exact:true});await expect(urlInput).toHaveValue(/shared\/[a-f0-9]{64}$/);
    const sharedUrl=await urlInput.inputValue();await urlPage.goto(sharedUrl);await expect(urlPage.locator(".shopping-card")).toHaveCount(2);
    await expect(urlPage.getByRole("button",{name:/買い物リストから削除/})).toHaveCount(0);
    await expect(urlPage.getByRole("heading",{name:"販売価格未登録"})).toBeVisible();
    await urlPage.getByRole("button",{name:"買取",exact:true}).click();await expect(urlPage.getByRole("heading",{name:state.shops[1].name,exact:true})).toBeVisible();
    ok(await owner.from("account_card_bookmarks").insert({user_id:state.users.owner.id,canonical_card_id:state.cards[2].id}));
    await expect(friendPage.locator(".shopping-card")).toHaveCount(3);await expect(urlPage.locator(".shopping-card")).toHaveCount(3);
    ok(await owner.from("account_card_bookmarks").delete().eq("canonical_card_id",state.cards[1].id));
    await expect(friendPage.locator(".shopping-card")).toHaveCount(2);await expect(urlPage.locator(".shopping-card")).toHaveCount(2);
    await anonContext.setOffline(true);await expect(urlPage.locator(".shopping-card")).toHaveCount(0);
    ok(await owner.from("account_card_bookmarks").insert({user_id:state.users.owner.id,canonical_card_id:state.cards[1].id}));
    await anonContext.setOffline(false);await expect(urlPage.locator(".shopping-card")).toHaveCount(3);
    await ownerPage.screenshot({path:".local/cloud-validation/owner-sharing.png",fullPage:true});
    await urlPage.screenshot({path:".local/cloud-validation/shared-mobile.png",fullPage:true});
    ownerPage.on("dialog",d=>d.accept());await ownerPage.getByRole("button",{name:"買い物リストを全件解除",exact:true}).click();
    await expect(friendPage.locator(".shopping-card")).toHaveCount(0);await expect(urlPage.locator(".shopping-card")).toHaveCount(0);
    await ownerPage.getByRole("button",{name:"URL共有を停止",exact:true}).click();await expect(urlPage.getByRole("status")).toContainText("閲覧できません");
    await urlPage.reload();await expect(urlPage.getByRole("status")).toContainText("閲覧できません");
    await checkbox.click();await expect(checkbox).not.toBeChecked();await expect(friendPage.getByRole("status")).toContainText("閲覧できません");
    await checkbox.click();await expect(checkbox).toBeChecked();await friendPage.reload();await expect(friendPage.getByText("共有リスト（閲覧専用）")).toBeVisible();
    ok(await friend.auth.signOut({scope:"global"}));await expect(friendPage.getByRole("status")).toContainText("閲覧できません");
  } finally {await Promise.all([ownerContext.close(),friendContext.close(),anonContext.close()]);await second.close();}
});

for(const mobile of [false,true])test(`${mobile?"mobile":"desktop"} real card artwork, rotation, input and card detail`,async({browser})=>{
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});
  try{
    await login(context,"owner");const page=await context.newPage();await page.goto("/");
    await page.getByRole("textbox",{name:"カード検索",exact:true}).fill("共有検証");
    await expect(page.getByText("検索結果 3件",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:`${state.cards[0].name}の画像を拡大`,exact:true})).toBeVisible();
    for(const [i,card] of state.cards.entries()){
      const trigger=page.getByRole("button",{name:`${card.name}の画像を拡大`,exact:true});if(mobile)await trigger.tap();else await trigger.click();
      const modal=page.getByRole("dialog");await expect(modal).toBeVisible();
      if(i<2)await expect.poll(()=>modal.locator("img").evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
      if(i===0){await expect(modal.locator(".card-artwork")).toHaveAttribute("data-artwork-rotation","90");await page.screenshot({path:`.local/cloud-validation/real-artwork-${mobile?"mobile":"desktop"}.png`});}
      if(i===2)await expect(modal.locator(".card-artwork-placeholder")).toBeVisible();
      await page.keyboard.press("Escape");await expect(trigger).toBeFocused();await expect(page.getByRole("textbox",{name:"カード検索",exact:true})).toHaveValue("共有検証");
    }
    await page.goto(`/register?cardId=${state.cards[0].id}`);await page.locator("#salePrice").fill("1234");await page.locator("#buyPrice").fill("567");
    await page.getByRole("button",{name:`${state.cards[0].name}の画像を拡大`}).click();await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("button",{name:"拡大画像を閉じる"}).click();
    await expect(page.locator("#salePrice")).toHaveValue("1234");await expect(page.locator("#buyPrice")).toHaveValue("567");
    await page.goto(`/cards/${state.cards[1].id}`);await expect(page.getByRole("heading",{name:state.cards[1].name,exact:true})).toBeVisible();
    await page.locator("#recent-heading").click();
    await expect(page.getByText("価格登録はまだありません。",{exact:true})).toBeVisible();
    await page.goto("/decks/new");await expect(page).not.toHaveURL(/login/);await expect(page.locator("main")).toContainText("デッキ");
  }finally{await context.close();}
});
