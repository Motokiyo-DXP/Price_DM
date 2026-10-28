import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareReplacement, buildDryRunSql, main } from "./audit-card-image-resolution.mjs";
const row = { print_id: 1, canonical_card_id: 2, official_card_id: "dmr05-s01", official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dmr05-s01", image_key: "official/dmr05-s01", manually_locked: false, image_width: 137, image_height: 191, image_byte_size: 1000 };
const url = "https://dm.takaratomy.co.jp/wp-content/card/cardimage/dmr05-s01.jpg";
const image = (width, height) => sharp({ create: { width, height, channels: 3, background: "red" } }).png().toBuffer();
for (const width of [137, 250]) test(`${width}px source is held without upscaling`, async () => {
  const bytes = await image(width, Math.round(width * 1.4));
  const result = await prepareReplacement(row, bytes, bytes, url);
  assert.equal(result.record.reason, "no_higher_native_resolution_source");
  assert.equal(result.bytes, undefined);
});
test("native high resolution stages a new immutable key and requires visual and rights review", async () => {
  const result = await prepareReplacement(row, await image(137, 191), await image(768, 1070), url);
  assert.equal(result.record.after.width, 384);
  assert.equal(result.record.source.width, 768);
  assert.match(result.record.proposed_image_key, /-sha256-[a-f0-9]{64}$/);
  assert.equal(result.record.review_outcome, "pending_review");
  assert.doesNotMatch(buildDryRunSql([result.record]), /update public/);
});
test("horizontal and two-sided faces retain orientation", async () => {
  const result = await prepareReplacement(row, await image(250, 179), await image(768, 550), url);
  assert.equal(result.record.after.width, 384);
  assert.ok(result.record.after.height < 384);
  const mismatch = await prepareReplacement(row, await image(137, 191), await image(768, 550), url);
  assert.equal(mismatch.record.reason, "orientation_or_crop_mismatch");
});
test("wrong print, same name different printing, locked and already improved rows are held", async () => {
  const before = await image(137, 191), source = await image(768, 1070);
  assert.equal((await prepareReplacement(row, before, source, url.replace("s01", "s02"))).record.reason, "printing_identity_mismatch");
  assert.equal((await prepareReplacement({ ...row, manually_locked: true }, before, source, url)).record.reason, "locked_or_unknown_lock");
  assert.equal((await prepareReplacement({ ...row, manually_locked: undefined }, before, source, url)).record.reason, "locked_or_unknown_lock");
  assert.equal((await prepareReplacement(row, source, source, url)).record.reason, "already_target_width");
});
test("broken assets fail decoding", async () => {
  await assert.rejects(prepareReplacement(row, Buffer.from("broken"), await image(768, 1070), url));
});
test("SQL fails closed and guards the exact original snapshot, locks and identity", async () => {
  const { record } = await prepareReplacement(row, await image(137, 191), await image(768, 1070), url);
  const approved = { ...record, review_outcome: "approved" };
  assert.throws(() => buildDryRunSql([approved]), /Unsafe approval/);
  const verified = { ...approved, source_identity: "exact_print_confirmed", identity_evidence: "card number and artwork inspected", quality_evidence: "native detail inspected", rights_review: "approved", rights_evidence: "operator permission reference", upload_verified_sha256: record.after.sha256 };
  const sql = buildDryRunSql([verified]);
  assert.match(sql, /manually_locked=false/);
  assert.match(sql, /canonical_card_id='2'/);
  assert.match(sql, /image_key='official\/dmr05-s01'/);
  assert.match(sql, /image_updated_at is not distinct from/);
  assert.match(sql, /rollback;/);
  for (const patch of [{ proposed_image_key: row.image_key }, { upload_verified_sha256: "bad" }, { manually_locked: true }]) assert.throws(() => buildDryRunSql([{ ...verified, ...patch }]));
});
test("CLI audits unknown dimensions separately, records HTTP failures and never requests writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "image-resolution-"));
  const previousFetch = globalThis.fetch;
  try {
    const full = await image(384, 275);
    const input = path.join(root, "input.json"), output = path.join(root, "output");
    await writeFile(input, JSON.stringify([{ ...row, image_width: null, image_height: null }, { ...row, print_id: 3, image_key: "official/missing" }]));
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return url.includes("missing") ? new Response("", { status: 404 }) : new Response(full);
    };
    await main([input, "https://images.example", output]);
    const result = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
    assert.equal(result[0].before.width, 384);
    assert.equal(result[0].reason, "already_target_width_visual_quality_unreviewed");
    assert.equal(result[1].reason, "asset_error: HTTP 404");
    assert.equal(requests.length, 2);
    assert.ok(requests.every((r) => r.options.method == null));
    assert.match(await readFile(path.join(output, "unknown-dimensions.csv"), "utf8"), /dmr05-s01/);
    assert.doesNotMatch(await readFile(path.join(output, "review-only.sql"), "utf8"), /update public/);
  } finally { globalThis.fetch = previousFetch; await rm(root, { recursive: true, force: true }); }
});
