import http from 'node:http';
import { readFile } from 'node:fs/promises';
// Optional local verification dependency; do not add it to the application bundle.
import { PGlite } from '../../.local/ogp-test/node_modules/@electric-sql/pglite/dist/index.js';
import sharp from 'sharp';
const db = new PGlite();
const realImageUrls = process.env.OGP_REAL_CARD_IMAGES
 ? JSON.parse(await readFile(process.env.OGP_REAL_CARD_IMAGES, 'utf8')) : null;
const realImages = realImageUrls ? await Promise.all(realImageUrls.map(async url => {
 const response = await fetch(url);
 if (!response.ok) throw Error(`Real card image returned ${response.status}`);
 return Buffer.from(await response.arrayBuffer());
})) : null;
const layoutFixtures = process.env.OGP_LAYOUT_FIXTURES ? JSON.parse(await readFile(process.env.OGP_LAYOUT_FIXTURES, 'utf8')) : null;
const layoutImages = new Map();
const fixturePrints = [1,2,3].map(id=>({id,canonical_card_id:id,image_key:`fixture/${id}`,product_name:null,card_number:null,official_card_id:null}));
await db.exec(`create role anon; create role authenticated;
create table decks(id uuid primary key, share_token uuid unique, name text, format text default 'original', description text default '', visibility text, icon_canonical_card_id int);
create table canonical_cards(id int primary key, name text);
create table deck_cards(id serial primary key, deck_id uuid, canonical_card_id int, card_print_id int, zone text, quantity int, sort_order int);
alter table decks enable row level security;
`);
const original = await readFile('supabase/migrations/20260916171445_deck_share_token.sql','utf8');
await db.exec(original.slice(original.indexOf('create function public.get_shared_deck')));
await db.exec(await readFile('supabase/migrations/20261020145639_public_shared_deck_ogp.sql','utf8'));
for(let i=1;i<=3;i++) {
 const id=`10000000-0000-4000-8000-00000000000${i}`, token=`20000000-0000-4000-8000-00000000000${i}`;
 await db.query('insert into decks(id,share_token,name,visibility,icon_canonical_card_id) values($1,$2,$3,$4,$5)',[id,token,i===1?'検証デッキA':i===2?'検証デッキB':'秘密デッキ',i===3?'private':'public',i]);
 await db.query('insert into canonical_cards values($1,$2)',[i,`カード${i}`]);
 await db.query("insert into deck_cards(deck_id,canonical_card_id,card_print_id,zone,quantity,sort_order) values($1,$2,$2,'main',40,0)",[id,i]);
}
await db.exec(`update deck_cards set quantity=20 where canonical_card_id=1;
insert into deck_cards(deck_id,canonical_card_id,card_print_id,zone,quantity,sort_order)
values('10000000-0000-4000-8000-000000000001',2,2,'main',20,1);`);
if (layoutFixtures) {
 for (const [index, fixture] of layoutFixtures.entries()) {
  const deckId = `10000000-0000-4000-8000-00000000000${index+1}`;
  await db.query('delete from deck_cards where deck_id=$1',[deckId]);
  for (const [cardIndex, card] of fixture.cards.entries()) {
   const id = 100 + index * 100 + cardIndex;
   await db.query('insert into canonical_cards values($1,$2)',[id,card.name]);
   await db.query('insert into deck_cards(deck_id,canonical_card_id,card_print_id,zone,quantity,sort_order) values($1,$2,$2,$3,$4,$5)',[deckId,id,card.zone,card.quantity,cardIndex]);
   fixturePrints.push({id,canonical_card_id:id,image_key:`fixture/${id}`,product_name:null,card_number:null,official_card_id:null});
   const response = await fetch(card.imageUrl);
   if(!response.ok)throw Error(`Layout artwork returned ${response.status}`);
   layoutImages.set(id,Buffer.from(await response.arrayBuffer()));
  }
  await db.query('update decks set icon_canonical_card_id=$1 where id=$2',[100 + index*100 + fixture.iconIndex,deckId]);
 }
}
await db.exec('set role anon');
for (const [token,expected] of [['20000000-0000-4000-8000-000000000001','検証デッキA'],['20000000-0000-4000-8000-000000000003',null],['20000000-0000-4000-8000-000000000009',null]]) {
 const {rows}=await db.query('select get_public_shared_deck($1) as deck',[token]);
 if((rows[0].deck?.name??null)!==expected) throw Error('anonymous SQL authorization failed');
}
await db.exec('reset role');
console.log('SQL: anonymous public/private/missing and EXECUTE grants passed');
let brokenImages = false;
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/images/')) {
   if(brokenImages){res.statusCode=404;return res.end();}
   const layoutId = Number(url.pathname.match(/\/(\d+)\.webp$/)?.[1]);
   if(layoutImages.has(layoutId)){res.setHeader('Content-Type','image/webp');return res.end(layoutImages.get(layoutId));}
   if(realImages){res.setHeader('Content-Type','image/webp');return res.end(realImages[url.pathname.includes('1.webp')?0:1]);}
   const color=url.pathname.includes('1.webp')?'#dc3535':'#2879df';
   res.setHeader('Content-Type','image/webp');return res.end(await sharp({create:{width:250,height:350,channels:3,background:color}}).webp().toBuffer());
  }
  let body='';for await(const part of req)body+=part;
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/broken-images'){brokenImages=true;return res.end('{}');}
  if(url.pathname==='/missing-icon'){await db.exec("update decks set icon_canonical_card_id=9999 where id='10000000-0000-4000-8000-000000000002'");return res.end('{}');}
  if(url.pathname==='/missing-card'){fixturePrints.find(p=>p.id===1).image_key=null;return res.end('{}');}
  if(url.pathname==='/rename') {await db.query("update decks set name='改名後デッキA' where name='検証デッキA'");return res.end('{}');}
  if(url.pathname==='/private-a') {await db.query("update decks set visibility='private' where name='改名後デッキA'");return res.end('{}');}
  if(url.pathname.includes('/rpc/')) {
   const func=url.pathname.endsWith('/get_public_shared_deck')?'get_public_shared_deck':'get_shared_deck';
   await db.exec('set role anon');
   const {rows}=await db.query(`select ${func}($1) as deck`,[JSON.parse(body).p_share_token]);
   await db.exec('reset role');return res.end(JSON.stringify(rows[0].deck));
  }
  if(url.pathname.endsWith('/card_prints'))return res.end(JSON.stringify(fixturePrints));
  return res.end('[]');
 }catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
});
server.listen(43127,'127.0.0.1',()=>console.log('Fixture Supabase facade on 127.0.0.1:43127 (isolated PGlite, no Production credentials)'));
