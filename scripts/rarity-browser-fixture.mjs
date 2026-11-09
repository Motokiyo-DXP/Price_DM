// Loopback-only test transport over actual isolated PostgreSQL (PGlite).
// Auth responses are fixtures; this does not validate hosted Supabase Auth.
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createCardSearchDb,readMigration} from './test-support/card-search-db.mjs';
const db=await createCardSearchDb();
await db.exec(`alter table card_products add column product_code text;
  alter table card_prints add column manually_locked boolean default false;
  update card_prints set official_card_id='fixture-'||id;
  update canonical_cards set deleted_at=now() where id=999;
  insert into canonical_cards(id,game_id,name,cost,cost_is_infinite,civilizations,card_types,races)
    values(7,1,'コストなし検証',null,false,'{zero}','{呪文}','{}'),(8,1,'コスト0検証',0,false,'{zero}','{呪文}','{}');
  insert into card_search_terms(canonical_card_id,normalized_term,term_kind)
    select id,normalize_card_search(name),'official_name' from canonical_cards where id in(7,8);`);
await db.exec(readMigration('20261028040039_card_keyword_infix_search.sql'));
await db.exec(readMigration('20261108132726_card_print_rarity_filters.sql'));
await db.exec(`update card_prints set rarity_codes=case id when 1 then '{C}'::text[] when 2 then '{SR}'::text[] when 3 then '{KGM}'::text[] end;
  update card_prints set rarity_codes='{C,U,R,VR,SR,OR,NONE,SPR,DMR,KGM,MAS,DSR,LEG,WVC,VIC,MSZ,MHZ,MDS,MDG,FFL,MSS,DG,KDL,KGR}' where id=4;
  create function public.deck_filter_options() returns jsonb language sql security invoker as $$ select private.deck_filter_options_impl() $$;
  grant execute on function public.deck_filter_options() to authenticated;`);
const id='00000000-0000-0000-0000-000000000001';
function session() {
  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const head=enc({alg:'HS256',typ:'JWT'}),body=enc({sub:id,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200});
  const sig=createHmac('sha256','rarity-local-fixture-only').update(`${head}.${body}`).digest('base64url');
  return {access_token:`${head}.${body}.${sig}`,refresh_token:'fixture',expires_in:7200,expires_at:Math.floor(Date.now()/1000)+7200,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{},created_at:'2026-11-08T00:00:00Z'}};
}
const argTypes={p_rarities:'text[]',p_query:'text',p_limit:'integer',p_offset:'integer',p_sort:'text',p_ascending:'boolean',p_product_name:'text',p_card_number:'text',p_civilizations:'text[]',p_civilization_mode:'text',p_color:'text',p_card_types:'text[]',p_min_cost:'integer',p_max_cost:'integer',p_min_power:'integer',p_max_power:'integer',p_race_tokens:'text[]',p_card_text_query:'text',p_image:'text'};
let queue=Promise.resolve();const requests=[];
async function handle(req,res) {
  res.setHeader('Access-Control-Allow-Origin','http://localhost:3000');
  res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS')return res.end();
  const url=new URL(req.url,'http://127.0.0.1:55483');
  const send=o=>res.end(JSON.stringify(o));
  if(url.pathname==='/__health')return send({ready:true});
  if(url.pathname==='/__session')return send(session());
  if(url.pathname==='/__requests')return send(requests);
  if(url.pathname==='/auth/v1/user')return send(session().user);
  if(url.pathname==='/auth/v1/.well-known/jwks.json')return send({keys:[]});
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
  try {
    await db.exec(`set request.jwt.claim.sub='${id}';set role authenticated;`);
    if(url.pathname==='/rest/v1/rpc/deck_filter_options')return send((await db.query('select deck_filter_options() as value')).rows[0].value);
    if(url.pathname==='/rest/v1/rpc/search_deck_cards_filtered') {
      const entries=Object.entries(body);if(entries.some(([k])=>!argTypes[k]))throw Error('Unexpected search argument');
      requests.push(body);
      const sql=`select * from search_deck_cards_filtered(${entries.map(([k],i)=>`${k}:=$${i+1}::${argTypes[k]}`).join(',')})`;
      return send((await db.query(sql,entries.map(([,v])=>v))).rows);
    }
    if(url.pathname==='/rest/v1/card_prints') {
      const ids=(url.searchParams.get('canonical_card_id')??'in.()').slice(4,-1).split(',').map(Number).filter(Number.isFinite);
      return send((await db.query('select * from card_prints where canonical_card_id=any($1::bigint[]) and deleted_at is null',[ids])).rows);
    }
    return send([]);
  } catch(e) {res.statusCode=400;send({message:e.message});}
  finally {await db.exec('reset role;');}
}
const server=http.createServer((req,res)=>{queue=queue.then(()=>handle(req,res)).catch(e=>{console.error(e.message);res.statusCode=500;res.end('{}');});});
server.listen(55483,'127.0.0.1',()=>console.log('Rarity fixture http://127.0.0.1:55483 (isolated PostgreSQL, fixture Auth)'));
