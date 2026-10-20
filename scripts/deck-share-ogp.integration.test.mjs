import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import test from "node:test";
import { load } from "cheerio";
import sharp from "sharp";

// Run only against the isolated fixture, never against a remote service.
const enabled = process.env.OGP_FIXTURE_TEST === "1";
const base = "http://127.0.0.1:3000";
const fixture = "http://127.0.0.1:43127";
const token = suffix => `20000000-0000-4000-8000-00000000000${suffix}`;
async function metadata(id, agent = "Line/14.0") {
  const response = await fetch(`${base}/deck-search?share=${id}`, { headers: { "User-Agent": agent } });
  assert.equal(response.status, 200);
  const html = await response.text();
  const $ = load(html.slice(0, html.indexOf("</head>") + 7));
  const get = name => $(`meta[property="${name}"],meta[name="${name}"]`).attr("content");
  return { html, title: get("og:title"), image: get("og:image"), url: get("og:url"), twitter: get("twitter:title"), twitterImage: get("twitter:image"), twitterCard: get("twitter:card"), description: get("og:description") };
}
async function image(url) {
  const pathname = new URL(url).pathname + new URL(url).search;
  const response = await fetch(base + pathname);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/png/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const bytes = Buffer.from(await response.arrayBuffer());
  const info = await sharp(bytes).metadata();
  assert.equal(info.width, 1200); assert.equal(info.height, 630);
  return { bytes, hash: createHash("sha256").update(bytes).digest("hex") };
}

test("anonymous initial HTML, separate images, rename, privacy and legacy viewing", { skip: !enabled }, async () => {
  const a = await metadata(token(1));
  const b = await metadata(token(2), "Mozilla/5.0");
  assert.equal(a.title, "検証デッキA"); assert.equal(b.title, "検証デッキB");
  for (const deck of [a, b]) {
    assert.equal(deck.title, deck.twitter); assert.equal(deck.image, deck.twitterImage);
    assert.equal(deck.twitterCard, "summary_large_image");
    assert.equal(deck.description, "デュエル・マスターズのデッキをチェック");
  }
  assert.equal(a.url, `https://dm-price-tracker.vercel.app/deck-search?share=${token(1)}`);
  assert.notEqual(a.image, b.image);
  for (const agent of ["Discordbot/2.0", "Twitterbot/1.0"]) {
    const result = await metadata(token(2), agent);
    assert.equal(result.title, b.title); assert.equal(result.image, b.image);
  }
  const ai = await image(a.image), bi = await image(b.image);
  assert.notEqual(ai.hash, bi.hash);
  await mkdir(".local/ogp-test/evidence", { recursive: true });
  await writeFile(".local/ogp-test/evidence/a.png", ai.bytes);
  await writeFile(".local/ogp-test/evidence/b.png", bi.bytes);
  await writeFile(".local/ogp-test/evidence/a.html", a.html);
  const fallback = await image("https://example.test/api/shared-decks/default/og-image");
  for (const id of [token(3), token(9), "invalid", token(1) + "/other"]) {
    const deck = await metadata(encodeURIComponent(id));
    assert.equal(deck.title, "デッキ検索 | TCG 相場チェッカー");
    assert.equal((await image(`https://example.test/api/shared-decks/${encodeURIComponent(id)}/og-image`)).hash, fallback.hash);
  }
  for (const suffix of [1, 2, 3]) {
    const response = await fetch(`${base}/api/shared-decks/${token(suffix)}/preview`);
    assert.equal(response.status, 200); assert.equal((await response.json()).cards.length, 40);
  }
  await fetch(fixture + "/rename", { method: "POST" });
  const renamed = await metadata(token(1));
  assert.equal(renamed.title, "改名後デッキA"); assert.notEqual(renamed.image, a.image);
  await fetch(fixture + "/private-a", { method: "POST" });
  assert.equal((await metadata(token(1))).title, "デッキ検索 | TCG 相場チェッカー");
  // Previously issued image URLs must also recheck visibility.
  assert.equal((await image(a.image)).hash, fallback.hash);
  await fetch(fixture + "/broken-images", { method: "POST" });
  assert.equal((await image(b.image)).hash, fallback.hash);
});
