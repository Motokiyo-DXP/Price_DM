import assert from "node:assert/strict";
import test from "node:test";
import { getCardPrintReleaseDate, getCardPrintVariantRank, pickCardPrint, pickCardPrintImageKey, pickCardPrintRepresentativesByCanonicalCardId, sortCardPrintsOldestFirst } from "./card-print-order.ts";

test("公式商品コードから収録日を特定する", () => {
  assert.equal(getCardPrintReleaseDate({ id: 1, card_number: "DM24-RP1 1/75" }), "2024-04-13");
});

test("指定収録版を優先し、未指定なら最古画像を選ぶ", () => {
  const prints = [
    { id: 2, card_number: "DM24-RP1", image_key: "new" },
    { id: 1, card_number: "DM23-RP1", image_key: "old" },
  ];
  assert.equal(pickCardPrintImageKey(prints, 2), "new");
  assert.equal(pickCardPrintImageKey(prints, null), "old");
  assert.equal(pickCardPrint(prints, 2)?.id, 2);
  assert.equal(pickCardPrint(prints, null)?.id, 1);
});

test("収録版を発売日の古い順に並べ、不明日は元データの古い順にする", () => {
  const prints = [
    { id: 2, card_number: "DM24-RP1 1/75" },
    { id: 4, card_number: "不明" },
    { id: 1, product_name: "DM23-RP1 商品" },
    { id: 3, card_number: "不明" },
  ];
  assert.deepEqual(sortCardPrintsOldestFirst(prints).map((print) => print.id), [1, 2, 4, 3]);
});

test("公式アーカイブにない初期基本セットも新しい再録より前に並べる", () => {
  const prints = [
    { id: 1, card_number: "DMEX17 超1/超40" },
    { id: 2, card_number: "DM1 8/110" },
  ];
  assert.deepEqual(sortCardPrintsOldestFirst(prints).map((print) => print.id), [2, 1]);
});

test("ウェルキウスはDMRP09版をデッキやホームの代表画像に選ぶ", () => {
  const prints = [
    { id: 1890, canonical_card_id: 1288, official_card_id: "dm25rp4-SP1", card_number: "DM25RP4 SP1/SP5", product_name: "DM25-RP4 王道W", image_key: "official/dm25rp4-sp1" },
    { id: 2077, canonical_card_id: 1288, official_card_id: "dm24sd2-001", card_number: "DM24SD2 1/15", product_name: "DM24-SD2", image_key: "official/dm24sd2-001" },
    { id: 2310, canonical_card_id: 1288, official_card_id: "dm26sd1-001", card_number: "DM26SD1 1/15", product_name: "DM26-SD1", image_key: "official/dm26sd1-001" },
    { id: 12811, canonical_card_id: 1288, official_card_id: "dmrp09-s03", card_number: "DMRP09 S3/S12", product_name: "DMRP-09 逆襲のギャラクシー 卍・獄・殺!!", image_key: "official/dmrp09-s03" },
  ];

  assert.equal(sortCardPrintsOldestFirst(prints)[0].id, 12811);
  assert.equal(pickCardPrint(prints, null)?.id, 12811);
  assert.equal(pickCardPrint(prints, 1890)?.id, 1890);
  assert.deepEqual(pickCardPrintRepresentativesByCanonicalCardId(prints).get(1288), {
    printId: 12811,
    imageKey: "official/dmrp09-s03",
  });
});

test("複数canonical cardの代表収録版をそれぞれ最古画像から返す", () => {
  const representatives = pickCardPrintRepresentativesByCanonicalCardId([
    { id: 6, canonical_card_id: 2, card_number: "DM24-RP1 1/75", image_key: "card-2-new" },
    { id: 5, canonical_card_id: 1, card_number: "DM24-RP1 1/75", image_key: "card-1-new" },
    { id: 9, canonical_card_id: 2, card_number: "DM23-RP1 1/74", image_key: "card-2-old" },
    { id: 8, canonical_card_id: 1, card_number: "DM23-RP1 1/74", image_key: "card-1-old" },
  ]);

  assert.deepEqual([...representatives], [
    [2, { printId: 9, imageKey: "card-2-old" }],
    [1, { printId: 8, imageKey: "card-1-old" }],
  ]);
});

test("同じ発売日では通常版、特殊版、プロモ版の順に並べる", () => {
  const prints = [
    { id: 23310, card_number: "DMPROMOY24 P93/Y24", product_name: "DM25-RP4 王道W", official_card_id: "promoy24-093" },
    { id: 23, card_number: "DM25RP4 ㊙16/㊙24", product_name: "DM25-RP4 王道W", official_card_id: "dm25rp4-Sec16" },
    { id: 22, card_number: "DM25RP4 12/78", product_name: "DM25-RP4 王道W", official_card_id: "dm25rp4-012" },
  ];
  assert.deepEqual(prints.map(getCardPrintVariantRank), [2, 1, 0]);
  assert.deepEqual(sortCardPrintsOldestFirst(prints).map((print) => print.id), [22, 23, 23310]);
});

test("特殊加工やトレジャー表記を特殊版として扱う", () => {
  assert.equal(getCardPrintVariantRank({ id: 1, card_number: "DM26EX2 PR5超/PR10" }), 1);
  assert.equal(getCardPrintVariantRank({ id: 2, card_number: "DM25EX3 TF5/TF40" }), 1);
  assert.equal(getCardPrintVariantRank({ id: 3, card_number: "DM25RP2 S7/S11" }), 0);
});
