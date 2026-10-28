import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { describe } from "./audit-card-image-resolution.mjs";
import { verifyCandidate } from "./prepare-card-image-release-bundle.mjs";

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(),"card-image-bundle-"));
  try {
    const source = await sharp({create:{width:573,height:800,channels:3,background:"blue"}}).png().toBuffer();
    const output = await sharp(source).resize({width:384,withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer();
    const row={print_id:1,official_card_id:"dmrp09-005",card_number:"DMRP09 5/102",before:{width:250,height:350}};
    const candidate={number_match:true,local_source:path.join(root,"source.png"),local_comparison:path.join(root,"output.webp"),native:await describe(source),after:await describe(output)};
    await writeFile(candidate.local_source,source);await writeFile(candidate.local_comparison,output);
    await run({row,candidate,snapshot:{...row,manually_locked:false,deleted_at:null},root});
  } finally { await rm(root,{recursive:true,force:true}); }
}

test("local bundle verifies native bytes and reproducible q78 output and uses a new full-hash key",()=>fixture(async({row,candidate,snapshot})=>{
  const result=await verifyCandidate(row,candidate,snapshot);
  assert.equal(result.image_key,`official/dmrp09-005-reviewed-sha256-${candidate.after.sha256}`);
  assert.equal(result.after.width,384);
}));
test("changed printing, deleted rows, locked rows and unknown locks are held",()=>fixture(async({row,candidate,snapshot})=>{
  for(const change of [{official_card_id:"other"},{card_number:"DMRP09 6/102"},{deleted_at:"2026-10-28"},{manually_locked:true},{manually_locked:undefined}]){
    await assert.rejects(verifyCandidate(row,candidate,{...snapshot,...change}),/identity or lock conflict/);
  }
}));
test("tampered originals or output bytes cannot be packaged as verified",()=>fixture(async({row,candidate,snapshot})=>{
  await assert.rejects(verifyCandidate(row,{...candidate,native:{...candidate.native,sha256:"0".repeat(64)}},snapshot),/bytes drifted/);
  await writeFile(candidate.local_comparison,Buffer.from("broken asset"));
  await assert.rejects(verifyCandidate(row,candidate,snapshot));
}));
test("a self-consistent manifest cannot hide an undocumented encoding",()=>fixture(async({row,candidate,snapshot})=>{
  const alternate=await sharp(candidate.local_source).resize({width:384}).webp({quality:95}).toBuffer();
  await writeFile(candidate.local_comparison,alternate);
  await assert.rejects(verifyCandidate(row,{...candidate,after:await describe(alternate)},snapshot),/documented WebP/);
}));
test("crop changes and already large originals cannot masquerade as a native resolution improvement",()=>fixture(async({row,candidate,snapshot})=>{
  await assert.rejects(verifyCandidate({...row,before:{width:250,height:180}},candidate,snapshot),/Orientation or crop/);
  await assert.rejects(verifyCandidate({...row,before:{width:650,height:909}},candidate,snapshot),/native resolution improvement/);
}));
