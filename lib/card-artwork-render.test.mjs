import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialBoard, toggleLegacyCardTapState } from './playfield-board.ts';
import { flippedCardFace } from './playfield-interactions.ts';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../components/card-artwork.tsx', import.meta.url), 'utf8');
let js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText;
for (const name of ['react', 'react/jsx-runtime']) js = js.replaceAll(`"${name}"`, JSON.stringify(pathToFileURL(require.resolve(name)).href));
for (const name of ['card-image', 'card-artwork-orientation']) js = js.replaceAll(`"@/lib/${name}"`, JSON.stringify(new URL(`./${name}.ts`, import.meta.url).href));
const { CardArtwork } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const render = (imageUrl, fit = 'contain') => renderToStaticMarkup(createElement(CardArtwork, { imageUrl, name: '検証カード', sizes: '150px', fit }));

test('landscape source rotates inside a portrait SVG viewport without crop even for cover callers', () => {
  const html = render('/cards/official/dm24bd5-036.webp', 'cover');
  assert.match(html, /viewBox="0 0 275 384"/);
  assert.match(html, /transform="translate\(275 0\) rotate\(90\)"/);
  assert.match(html, /object-fit:contain/);
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(html, /role="img"/);
});

test('portrait horizontal designs already have cost at top and retain the original image path', () => {
  const html = render('/cards/official/dmr23-030.webp');
  assert.doesNotMatch(html, /<svg|<foreignObject/);
  assert.match(html, /data-artwork-rotation="0"/);
  assert.doesNotMatch(html, /style="[^"]*transform/);
});

test('normal image and unregistered placeholder keep the original img path', () => {
  const upright = render('/card-back.svg');
  const missing = render(null);
  assert.doesNotMatch(upright, /<svg|<foreignObject/);
  assert.match(missing, /card-artwork-placeholder/);
  assert.match(missing, /src="\/card-back.svg"/);
  assert.doesNotMatch(missing, /data-artwork-rotation|<svg/);
});

test('tap, untap and face flips preserve image orientation and hide the artwork when face-down', () => {
  const imageUrl = '/cards/official/dm24bd5-036.webp';
  const state = initialBoard([{ canonicalCardId: 1, name: 'メメント', quantity: 40, sortOrder: 0, imageUrl }], () => 0.5);
  state.players.p1.battle.push({ ...state.players.p1.deck.pop(), face: 'face_up' });
  const original = state.players.p1.battle[0];
  const tapped = toggleLegacyCardTapState(state, 'p1', 'battle', original.instanceId, { clearKeepTappedOnUntap: true });
  assert.equal(tapped.players.p1.battle[0].tapped, true);
  const untapped = toggleLegacyCardTapState(tapped, 'p1', 'battle', original.instanceId, { clearKeepTappedOnUntap: true });
  assert.equal(untapped.players.p1.battle[0].tapped, false);
  assert.equal(untapped.players.p1.battle[0].imageUrl, imageUrl);
  assert.equal(render(tapped.players.p1.battle[0].imageUrl), render(original.imageUrl));
  const down = flippedCardFace('battle', original.face);
  assert.equal(down, 'face_down');
  assert.doesNotMatch(render(down === 'face_down' ? '/card-back.svg' : imageUrl), /<svg/);
  assert.equal(flippedCardFace('battle', down), 'face_up');
  assert.match(render(original.imageUrl), /data-artwork-rotation="90"/);
});
