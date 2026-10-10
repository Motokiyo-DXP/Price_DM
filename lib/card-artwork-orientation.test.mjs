import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_ARTWORK_ORIENTATIONS, getCardArtworkOrientation } from './card-artwork-orientation.ts';

test('Memento prints normalize both stored orientations with the cost at the top', () => {
  for (const key of ['dmr23-030', 'promoy17-018', 'promoy17-021']) {
    assert.equal(getCardArtworkOrientation(`/cards/official/${key}.webp`), null);
  }
  for (const key of ['dm23bd5-039', 'dm24bd3-012', 'dm24bd5-036', 'dmbd15-015', 'dmex06-076']) {
    assert.equal(getCardArtworkOrientation(`/cards/official/${key}.webp`).rotation, 90);
  }
});

test('the same image key resolves in local, CDN, encoded and query-string URLs', () => {
  const expected = CARD_ARTWORK_ORIENTATIONS['official/dm24bd5-036'];
  for (const url of ['/cards/official/dm24bd5-036.webp', 'https://cdn.example/official/dm24bd5-036.webp?v=1#image', '/cards/official/dm24bd5%2D036.webp']) {
    assert.deepEqual(getCardArtworkOrientation(url), expected);
  }
});

test('upright faces, card backs, unregistered cards and unknown images stay untouched', () => {
  for (const url of [null, '/card-back.svg', '/cards/sample/welchius.webp', '/cards/official/dmbd14-001.webp', '/cards/official/dmart15-002.webp', '/cards/official/dmr23-ffl01.webp', '/cards/official/promoy13-080.webp', '/cards/official/unknown.webp', '/cards/official/%ZZ.webp']) {
    assert.equal(getCardArtworkOrientation(url), null);
  }
});

test('aura, fortress, WD double designs and newly imported portrait artwork have explicit corrections', () => {
  assert.equal(getCardArtworkOrientation('/cards/official/dmrp09-004.webp').rotation, 90);
  assert.equal(getCardArtworkOrientation('/cards/official/dmsd09-001.webp'), null);
  assert.equal(getCardArtworkOrientation('/cards/official/dmr14-004.webp'), null);
  assert.equal(getCardArtworkOrientation('/cards/official/dm25ex2-045.webp').rotation, 90);
  assert.equal(getCardArtworkOrientation('/cards/official/dm26ex4-preview-022-68b1d76710acd786.webp'), null);
});

test('audited dimensions yield a portrait viewport and place the recorded cost corner at its top', () => {
  assert.equal(Object.keys(CARD_ARTWORK_ORIENTATIONS).length, 292);
  for (const item of Object.values(CARD_ARTWORK_ORIENTATIONS)) {
    const { width, height, rotation } = item;
    assert.ok(width > 0 && height > 0);
    const outputWidth = height;
    const outputHeight = width;
    assert.ok(outputHeight > outputWidth);
    // Clockwise 90: the stored cost corner (0, 0) becomes (height, 0).
    assert.equal(rotation, 90);
    const sourceCostCorner = { x: 0, y: 0 };
    const costCorner = { x: height - sourceCostCorner.y, y: sourceCostCorner.x };
    assert.equal(costCorner.x, outputWidth);
    assert.equal(costCorner.y, 0);
  }
});
