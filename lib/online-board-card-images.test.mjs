import assert from "node:assert/strict";
import test from "node:test";
import { collectBoardCanonicalCardIds, collectBoardCanonicalCardIdsNeedingImages, resolveOnlineBoardCardImages } from "./online-board-card-images.ts";

const prints = [
  { id: 1890, canonical_card_id: 1288, official_card_id: "dm25rp4-SP1", card_number: "DM25RP4 SP1/SP5", product_name: "DM25-RP4 王道W", image_key: "official/dm25rp4-sp1" },
  { id: 12811, canonical_card_id: 1288, official_card_id: "dmrp09-s03", card_number: "DMRP09 S3/S12", product_name: "DMRP-09", image_key: "official/dmrp09-s03" },
  { id: 20, canonical_card_id: 42, card_number: "DM24-RP1 1/75", product_name: "DM24-RP1", image_key: "official/dm24rp1-001" },
];

const card = (instanceId, canonicalCardId, cardPrintId = null) => ({
  instanceId,
  canonicalCardId,
  cardPrintId,
  name: "カード",
  imageUrl: null,
  face: "public",
  tapped: false,
  shieldMarker: null,
});

test("オンライン盤面のカードIDをゾーン横断で重複なく収集する", () => {
  const board = {
    players: {
      p1: { deck: [card("a", 1288), card("b", 42)], hand: [], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [], deckInspection: [] },
      p2: { deck: [card("c", 1288, 1890)], hand: [], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [], deckInspection: [] },
    },
    turn: 1,
    activePlayer: "p1",
    shieldPlacementOrder: { p1: 1, p2: 1 },
  };

  assert.deepEqual(collectBoardCanonicalCardIds(board).sort((a, b) => a - b), [42, 1288]);
});

test("盤面画像が未解決の表示カードだけを追加取得対象にする", () => {
  const board = { players: { p1: { deck: [card("missing", 1288)], hand: [{ ...card("loaded", 42), imageUrl: "/ready.webp" }] }, p2: { deck: [{ ...card("hidden", 55), canonicalCardId: null }] } } };

  assert.deepEqual(collectBoardCanonicalCardIdsNeedingImages(board), [1288]);
});

test("対戦盤面は未指定なら最古画像、指定済みなら選択print画像を表示する", () => {
  const board = {
    players: {
      p1: { deck: [card("oldest-default", 1288), card("explicit", 1288, 1890)], hand: [], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [], deckInspection: [] },
      p2: { deck: [], hand: [card("other", 42)], shield: [], mana: [], battle: [], graveyard: [], hyperspatial: [], gr: [], abyss: [], reveal: [], deckInspection: [] },
    },
    turn: 1,
    activePlayer: "p1",
    shieldPlacementOrder: { p1: 1, p2: 1 },
  };
  const resolved = resolveOnlineBoardCardImages(board, prints);

  assert.match(resolved.players.p1.deck[0].imageUrl, /official\/dmrp09-s03\.webp$/);
  assert.match(resolved.players.p1.deck[1].imageUrl, /official\/dm25rp4-sp1\.webp$/);
  assert.equal(resolved.players.p1.deck[1].cardPrintId, 1890);
  assert.match(resolved.players.p2.hand[0].imageUrl, /official\/dm24rp1-001\.webp$/);
});
