import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { matchesPrintingNumber, extractCandidates } from "./research-card-image-candidates.mjs";
import { buildMetadataPatch, buildMetadataRollback } from "./build-card-image-metadata-patch.mjs";
test("external candidates require exact set and print number, including rarity suffix", () => {
  assert.equal(matchesPrintingNumber("グレイテスト (DMR-05 S1/S7)","DMR05 S1/S7"),true);
  for(const wrong of ["(DMR05 S1秘/S7)","(DMR05 S1/S70)","(DM23EX3 TR12/TR15)","(XDMR05 S1/S7)"]) assert.equal(matchesPrintingNumber(wrong,"DMR05 S1/S7"),false);
});
test("extract only linked shop image origins and matching printing; preserve duplicate name variants for review", () => {
  const html=`<a href="/view/item/1"><img src="https://makeshop-multi-images.akamaized.net/nemcard/itemimages/a.jpg"></a><a href="/view/item/1">Card (DMR05 S1/S7)</a><a href="/view/item/2"><img src="https://bad.example/fake.jpg">Card (DMR05 S1/S7)</a><a href="/view/item/3"><img src="https://makeshop-multi-images.akamaized.net/nemcard/itemimages/b.jpg">Card (DMR05 S2/S7)</a>`;
  const candidates=extractCandidates(html,{card_number:"DMR05 S1/S7"},"https://www.nemcard.com/view/search");
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].product_url,"https://www.nemcard.com/view/item/1");
});
const row={print_id:1,canonical_card_id:2,official_card_id:"dm-1",image_key:"official/unchanged",image_width:null,image_height:null,image_byte_size:null,image_updated_at:null,manually_locked:false,verified:{width:384,height:275,byte_size:1234,sha256:"a".repeat(64)}};
async function fixture(){
  const db=new PGlite();
  await db.exec(`create table public.card_prints(id bigint primary key,canonical_card_id bigint,official_card_id text,image_key text,image_width integer,image_height integer,image_byte_size integer,image_updated_at timestamptz,manually_locked boolean,deleted_at timestamptz,card_number text);
insert into public.card_prints(id,canonical_card_id,official_card_id,image_key,manually_locked,card_number) values(1,2,'dm-1','official/unchanged',false,'original');`);
  return db;
}
test("metadata dry run rolls back; apply fills only null metadata preserving key, printing and timestamp",async()=>{
  const db=await fixture();try{
    await db.exec(buildMetadataPatch([row]));
    assert.equal((await db.query("select image_width from public.card_prints")).rows[0].image_width,null);
    await db.exec(buildMetadataPatch([row],{commit:true}));
    const actual=(await db.query("select * from public.card_prints")).rows[0];
    assert.equal(actual.image_width,384);assert.equal(actual.image_height,275);assert.equal(actual.image_byte_size,1234);
    assert.equal(actual.image_key,row.image_key);assert.equal(actual.image_updated_at,null);assert.equal(actual.card_number,"original");
    await assert.rejects(db.exec(buildMetadataPatch([row],{commit:true})),/snapshot conflict/i);
  }finally{await db.close()}
});
test("metadata snapshot drift or lock aborts the entire transaction",async()=>{
  for(const statement of ["manually_locked=true","image_key='changed'","image_width=137","canonical_card_id=99","deleted_at=now()"]){
    const db=await fixture();try{
      await db.exec(`update public.card_prints set ${statement}`);
      await assert.rejects(db.exec(buildMetadataPatch([row],{commit:true})),/snapshot conflict/i);
      await db.exec("rollback");
      assert.equal((await db.query("select image_byte_size from public.card_prints")).rows[0].image_byte_size,null);
    }finally{await db.close()}
  }
  for(const change of [{manually_locked:undefined},{image_width:137},{verified:{...row.verified,sha256:""}}])assert.throws(()=>buildMetadataPatch([{...row,...change}]),/unsafe/i);
  assert.throws(()=>buildMetadataPatch([row,row]),/duplicate/i);
});
test("all 159 actual metadata candidates apply and preserve identifiers in an isolated database",async()=>{
  const rows=JSON.parse(await readFile(new URL('../reports/card-image-resolution/followup-20261028/metadata-evidence.json',import.meta.url),'utf8'));
  assert.equal(rows.length,159);
  const db=await fixture();const quote=v=>v==null?'null':"'"+String(v).replaceAll("'","''")+"'";
  try{
    await db.exec('delete from public.card_prints');
    await db.exec('insert into public.card_prints(id,canonical_card_id,official_card_id,image_key,manually_locked) values '+rows.map(r=>`(${r.print_id},${r.canonical_card_id},${quote(r.official_card_id)},${quote(r.image_key)},false)`).join(','));
    await db.exec(buildMetadataPatch(rows,{commit:true}));
    const actual=(await db.query('select * from public.card_prints order by id')).rows;
    assert.equal(actual.length,159);
    const before=new Map(rows.map(r=>[r.print_id,r]));
    for(const r of actual){const expected=before.get(Number(r.id));assert.equal(r.image_key,expected.image_key);assert.equal(r.official_card_id,expected.official_card_id);assert.equal(Number(r.canonical_card_id),expected.canonical_card_id);assert.equal(r.image_width,expected.verified.width);assert.equal(r.image_height,expected.verified.height);assert.equal(r.image_byte_size,expected.verified.byte_size);assert.equal(r.image_updated_at,null)}
    await db.exec(buildMetadataRollback(rows,{commit:true}));
    for(const r of (await db.query('select * from public.card_prints')).rows){const expected=before.get(Number(r.id));assert.equal(r.image_width,expected.image_width);assert.equal(r.image_height,expected.image_height);assert.equal(r.image_byte_size,expected.image_byte_size);assert.equal(r.image_key,expected.image_key)}
  }finally{await db.close()}
});
test("metadata rollback restores saved values and refuses drift after apply",async()=>{
  const db=await fixture();try{
    await db.exec(buildMetadataPatch([row],{commit:true}));
    await db.exec(buildMetadataRollback([row],{commit:true}));
    const restored=(await db.query('select * from public.card_prints')).rows[0];
    assert.equal(restored.image_width,null);assert.equal(restored.image_height,null);assert.equal(restored.image_byte_size,null);
    assert.equal(restored.image_key,row.image_key);assert.equal(restored.card_number,'original');
    await db.exec(buildMetadataPatch([row],{commit:true}));
    await db.exec('update public.card_prints set image_byte_size=9999');
    await assert.rejects(db.exec(buildMetadataRollback([row],{commit:true})),/rollback snapshot conflict/i);
    await db.exec('rollback');
    assert.equal((await db.query('select image_width,image_byte_size from public.card_prints')).rows[0].image_byte_size,9999);
  }finally{await db.close()}
});
