// Loopback-only PostgREST/Auth test adapter over real isolated PostgreSQL.
// This is a controlled transport fixture, not evidence of live Supabase Auth.
import http from "node:http";
import { createHmac } from "node:crypto";
import { createShoppingTestDatabase, asUser, owner, friend, stranger } from "./shopping-sharing-db.test.mjs";

const db = await createShoppingTestDatabase();
export const identities = { owner, friend, stranger };
const cards = [{ id:1,name:"テスト価格登録カード",image_key:"official/dm22bd1-004" }, { id:2,name:"テスト価格未登録カード",image_key:"test/portrait" }, { id:3,name:"テスト画像未登録カード",image_key:null }];
const prints = cards.filter(c=>c.image_key).map(c=>({id:c.id,canonical_card_id:c.id,image_key:c.image_key,product_name:"DM22-BD1",card_number:String(c.id),official_card_id:`dm22bd1-00${c.id}`}));
const records = [{id:1,canonical_card_id:1,shop_id:1,sale_price:100,buy_price:50,card_print_id:null,observed_on:"2026-10-17",created_at:"2026-10-17T00:00:00Z"}, {id:2,canonical_card_id:1,shop_id:2,sale_price:200,buy_price:80,card_print_id:null,observed_on:"2026-10-17",created_at:"2026-10-17T00:00:00Z"}];
const market = c => ({canonical_card_id:c.id,name:c.name,name_kana:null,game_id:1,game_name:"デュエル・マスターズ",game_slug:"duel-masters",aliases:[],aliases_kana:[],print_count:1,sale_price:c.id===1?100:null,buy_price:c.id===1?80:null,sale_record_count:c.id===1?2:0,buy_record_count:c.id===1?2:0,sale_trend:null,buy_trend:null,stock_status:"unknown",last_observed_on:c.id===1?"2026-10-17":null,is_stale:false,uses_print_fallback:false,image_key:c.image_key});
function session(id) {
  const enc = x=>Buffer.from(JSON.stringify(x)).toString("base64url");
  const head=enc({alg:"HS256",typ:"JWT"});
  const body=enc({sub:id,role:"authenticated",aud:"authenticated",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
  const sig=createHmac("sha256","isolated-fixture-only").update(`${head}.${body}`).digest("base64url");
  return {access_token:`${head}.${body}.${sig}`,refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id,aud:"authenticated",role:"authenticated",email:"fixture@example.test",app_metadata:{},user_metadata:{},created_at:"2026-10-17T00:00:00Z"}};
}
function userId(req) {
  try { const token=req.headers.authorization?.replace(/^Bearer /,"");const id=JSON.parse(Buffer.from(token.split(".")[1],"base64url")).sub;return Object.values(identities).includes(id)?id:null; } catch { return null; }
}
function filter(rows,url) {
  return rows.filter(row=>[...url.searchParams].every(([key,value])=>{
    if (["select","order","limit","offset"].includes(key)) return true;
    if (value.startsWith("eq.")) return String(row[key])===value.slice(3);
    if (value.startsWith("in.(")) return value.slice(4,-1).split(",").includes(String(row[key]));
    return true;
  }));
}
const server=http.createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","http://localhost:3000");
  res.setHeader("Access-Control-Allow-Headers","authorization,apikey,content-type,content-profile,accept-profile,x-client-info,prefer,x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Content-Type","application/json");
  if(req.method==="OPTIONS") {res.end();return;}
  const url=new URL(req.url,"http://127.0.0.1:55441"),user=userId(req);
  const chunks=[];for await(const chunk of req) chunks.push(chunk);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  const send=data=>res.end(JSON.stringify(data));
  try {
    if(url.pathname==="/__health") return send({ready:true});
    if(url.pathname.startsWith("/__session/")) return send(session(identities[url.pathname.split("/").at(-1)]));
    if(url.pathname==="/__reset" && req.method==="POST") {
      await db.exec("delete from private.shopping_list_readers; delete from private.shopping_list_shares; delete from public.account_card_bookmarks;");
      await db.query("insert into public.account_card_bookmarks(user_id,canonical_card_id) values ($1,1),($1,2)",[owner]);return send({ok:true});
    }
    if(url.pathname==="/auth/v1/user") { if(!user) {res.statusCode=401;return send({message:"not authenticated"});} return send(session(user).user); }
    if(url.pathname.startsWith("/rest/v1/rpc/")) {
      const name=url.pathname.split("/").at(-1);
      const functions={
        read_shopping_list:["select public.read_shopping_list($1,$2) as value",[body.p_share_id??null,body.p_token??null]],
        shopping_share_settings:["select public.shopping_share_settings() as value",[]],
        set_shopping_friend:["select public.set_shopping_friend($1,$2) as value",[body.p_reader,body.p_enabled]],
        set_shopping_url:["select public.set_shopping_url($1) as value",[body.p_enabled]],
        shared_shopping_lists:["select * from public.shared_shopping_lists()",[]],
      };
      if(functions[name]) {
        const [sql,params]=functions[name];const rows=await asUser(db,user,sql,params);
        return send(name==="shared_shopping_lists"?rows:rows[0].value);
      }
      if(name==="list_my_friends") return send(user===owner?[{friend_user_id:friend,display_name:"テストフレンド"}]:user===friend?[{friend_user_id:owner,display_name:"所有者"}]:[]);
      if(name==="load_market_cards_with_images") return send(cards.map(market));
      if(name==="search_market_cards") return send(cards.filter(c=>c.name.includes(body.p_query)).map(c=>({...market(c),id:c.id})));
      if(name==="search_registration_cards") return send(cards.filter(c=>c.name.includes(body.p_query)).map(c=>({...c,print_count:1})));
      if(name==="list_card_prints") return send(prints.filter(p=>p.canonical_card_id===body.p_canonical_card_id));
      if(name==="create_registration_session") return send([{status:"ok",session_token:"a".repeat(64),expires_at:"2099-01-01T00:00:00Z"}]);
      if(name==="validate_registration_session") return send("2099-01-01T00:00:00Z");
      return send([]);
    }
    const table=url.pathname.split("/").at(-1);
    if(table==="account_card_bookmarks") {
      if(req.method==="POST") {
        for(const row of Array.isArray(body)?body:[body]) await asUser(db,user,"insert into public.account_card_bookmarks(user_id,canonical_card_id) values ($1,$2) on conflict do nothing",[row.user_id,row.canonical_card_id]);
        return send(null);
      }
      const rows=await asUser(db,user,"select * from public.account_card_bookmarks");
      if(req.method==="DELETE") for(const row of filter(rows,url)) await asUser(db,user,"delete from public.account_card_bookmarks where canonical_card_id=$1",[row.canonical_card_id]);
      return send(req.method==="DELETE"?null:filter(rows,url));
    }
    const tables={canonical_cards:cards.map(c=>({...c,game_id:1,name_kana:null,aliases:[],aliases_kana:[]})),card_prints:prints,price_records:records,shops:[{id:1,name:"店舗A"},{id:2,name:"店舗B"}],tcg_games:[{id:1,slug:"duel-masters",name:"デュエル・マスターズ",created_at:"2026-10-17T00:00:00Z"}],canonical_card_market_summary:[market(cards[0])]};
    const rows=filter(tables[table]??[],url);
    return send(req.headers.accept?.includes("application/vnd.pgrst.object+json")?rows[0]??null:rows);
  } catch(error) {res.statusCode=403;send({code:error.code??"42501",message:error.message});}
});
server.listen(55441,"127.0.0.1",()=>console.log("Isolated shopping fixture ready on 127.0.0.1:55441"));
