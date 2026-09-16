import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInput, previewImageNumber } from "./build-dm26rp3-preview-import.mjs";

test("maps the official preview numbering", () => {
  assert.equal(previewImageNumber("1/77"), 47);
  assert.equal(previewImageNumber("S11/S11"), 46);
  assert.equal(previewImageNumber("TR9/TR9"), 25);
  assert.equal(previewImageNumber("SP1/SP5"), null);
});

test("normalizes twin-impact data into the existing canonical format", () => {
  const input = {
    set_code: "DM26-RP3",
    official_product_url: "https://dm.takaratomy.co.jp/product/dm26rp3/",
    record_count: 1,
    cards: [{
      card_number: "4/77", name: "ミノガミ＆オウ禍武斗／T.2.D.", civilization: ["自然"], cost: null, set_code: "DM26-RP3",
      faces: [{ name: "ミノガミ＆オウ禍武斗", civilization: ["自然"], cost: 9 }, { name: "T.2.D.", civilization: ["自然"], cost: 4 }],
    }],
  };
  const cards = normalizeInput(input);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards.find((card) => card.sourceNumber === "4/77"), {
    sourceNumber: "4/77", cardNumber: "DM26RP3 4/77", name: "ミノガミ＆オウ禍武斗 / T.2.D.", cost: 9,
    civilizations: ["nature"], cardTypes: ["クリーチャー", "呪文"], faceNames: ["ミノガミ＆オウ禍武斗", "T.2.D."], imageId: "050", imageKey: "official/dm26rp3-preview-050",
  });
});
