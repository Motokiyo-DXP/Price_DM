import assert from "node:assert/strict";
import test from "node:test";
import { mapDeckSearchResults } from "./deck-search-mapping.ts";
import { pickCardPrintRepresentativesByCanonicalCardId } from "./card-print-order.ts";

test("デッキ検索の追加用print idと画像を最古収録版に合わせる", () => {
  const prints = pickCardPrintRepresentativesByCanonicalCardId([
    { id: 1890, canonical_card_id: 1288, card_number: "DM25RP4 SP1/SP5", product_name: "DM25-RP4 王道W", image_key: "official/dm25rp4-sp1" },
    { id: 12811, canonical_card_id: 1288, card_number: "DMRP09 S3/S12", product_name: "DMRP-09", image_key: "official/dmrp09-s03" },
  ]);
  const [card] = mapDeckSearchResults([{
    id: 1288,
    name: "闘門の精霊ウェルキウス",
    print_count: 4,
    representative_print_id: 1890,
    image_key: "official/dm25rp4-sp1",
  }], prints);

  assert.match(card.imageUrl, /official\/dmrp09-s03\.webp$/);
  assert.deepEqual(card.imageOptions, [{ printId: 12811, url: card.imageUrl }]);
});

test("print取得にない検索RPC画像は選ばず、既定画像を誤表示しない", () => {
  const [card] = mapDeckSearchResults([{
    id: 1288,
    name: "闘門の精霊ウェルキウス",
    print_count: 4,
    representative_print_id: 1890,
    image_key: "official/dm25rp4-sp1",
  }], new Map());

  assert.equal(card.imageUrl, null);
  assert.deepEqual(card.imageOptions, []);
});
