import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {buildReviewedImagePatch,transactionBody} from "./reviewed-card-image-patch.mjs";
import worker from "../cloudflare/card-images/src/index.js";
const sample=()=>({print_id:1,official_card_id:"dmr05-s01",image_key:`official/dmr05-s01-reviewed-sha256-${"a".repeat(64)}`,before:{canonical_card_id:2,official_card_id:"dmr05-s01",card_number:"DMR05 S1/S7",product_name:"DMR05",official_url:"https://dm.takaratomy.co.jp/card/detail/?id=dmr05-s01",manually_locked:false,deleted_at:null,image_key:"official/dmr05-s01",image_width:137,image_height:191,image_byte_size:1000,image_updated_at:null,updated_at:null},before_asset:{width:137,height:191},source:{width:600,height:840},after:{width:384,height:538,byte_size:2000,sha256:"a".repeat(64)},source_url:"https://makeshop-multi-images.akamaized.net/nemcard/itemimages/a.jpg",permission:{user_confirmed_site_use:true,source_provider:"NEM"},review:Object.fromEntries(["card_name","card_number","illustration","border","rarity","printed_text","orientation","crop","quality"].map(k=>[k,"confirmed"])),review_evidence:"Explicit exact-print visual and official-text comparison"});
async function fixture(){const db=new PGlite();await db.exec(`create table card_prints(id bigint,canonical_card_id bigint,official_card_id text,card_number text,product_name text,official_url text,manually_locked boolean,deleted_at timestamptz,image_key text,image_width integer,image_height integer,image_byte_size integer,image_updated_at timestamptz,updated_at timestamptz);insert into card_prints values(1,2,'dmr05-s01','DMR05 S1/S7','DMR05','https://dm.takaratomy.co.jp/card/detail/?id=dmr05-s01',false,null,'official/dmr05-s01',137,191,1000,null,null);`);return db;}
test("requires permission, exact print/text/quality review, correct namespace and unique IDs",()=>{
 const r=sample();for(const bad of [{...r,permission:{}},{...r,review:{...r.review,printed_text:"pending"}},{...r,image_key:r.image_key.replace("official/","reviewed/")},{...r,before:{...r.before,manually_locked:true}}])assert.throws(()=>buildReviewedImagePatch([bad]),/Unapproved/);
 assert.throws(()=>buildReviewedImagePatch([r,r]),/duplicate/);
});
test("apply, dry run, rerun refusal and guarded rollback preserve identity",async()=>{const db=await fixture();try{const r=sample();await db.exec(buildReviewedImagePatch([r]));assert.equal((await db.query('select image_width from card_prints')).rows[0].image_width,137);await db.exec(buildReviewedImagePatch([r],{commit:true}));assert.equal((await db.query('select image_key from card_prints')).rows[0].image_key,r.image_key);await assert.rejects(db.exec(buildReviewedImagePatch([r],{commit:true})),/snapshot conflict/);await db.exec('rollback');await db.exec(buildReviewedImagePatch([r],{commit:true,rollback:true}));const actual=(await db.query('select * from card_prints')).rows[0];assert.equal(actual.image_key,r.before.image_key);assert.equal(actual.canonical_card_id,2);assert.equal(actual.card_number,r.before.card_number);}finally{await db.close()}});
test("a changed target prevents the transaction from silently updating fewer rows",async()=>{const db=await fixture();try{await db.exec('update card_prints set manually_locked=true');await assert.rejects(db.exec(buildReviewedImagePatch([sample()],{commit:true})),/snapshot conflict/);await db.exec('rollback');assert.equal((await db.query('select image_width from card_prints')).rows[0].image_width,137);}finally{await db.close()}});
test("current worker serves official versioned keys and rejects the old reviewed prefix",async()=>{
 const previous=globalThis.caches;globalThis.caches={default:{match:async()=>null,put:async()=>{}}};try{
 const key=sample().image_key+'.webp',seen=[];
 const env={CARD_IMAGES:{get:async(k)=>{seen.push(k);return{body:new Uint8Array([1]),httpMetadata:{contentType:'image/webp'}}}}};
 const ctx={waitUntil:()=>{}};
 assert.equal((await worker.fetch(new Request('https://images.example/'+key),env,ctx)).status,200);
 assert.equal(seen[0],key);
 assert.equal((await worker.fetch(new Request('https://images.example/'+key.replace('official/','reviewed/')),env,ctx)).status,404);
 }finally{globalThis.caches=previous;}
});
test("transaction composition strips only the outer transaction",()=>{const sql=buildReviewedImagePatch([sample()]);const body=transactionBody(sql);assert.match(body,/do \$image_release\$/);assert.doesNotMatch(body,/^begin;/);assert.doesNotMatch(body,/rollback;\n$/)});
