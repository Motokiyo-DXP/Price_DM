import assert from "node:assert/strict";
import test from "node:test";
import { matchCardsToReleases } from "./build-dm-product-release-import.mjs";

test("matches card prints by official product slug and title fallback", () => {
  const releases = [
    { product_code: "DM23RP1", product_name: "DM23-RP1デュエル・マスターズTCG", release_date: "2023-04-22" },
    { product_code: "DMR16真", product_name: "DMR-16真 商品", release_date: "2015-03-21" },
  ];
  const cards = [
    { official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm23rp1-001", product_name: "DM23-RP1 商品" },
    { official_url: "https://dm.takaratomy.co.jp/card/detail/?id=unknown-001", product_name: "DMR-16真 商品" },
    { official_url: "https://dm.takaratomy.co.jp/card/detail/?id=dm23rp1+1s-001", product_name: "DM23-RP1 商品" },
  ];
  assert.deepEqual(matchCardsToReleases(cards, releases), [
    { official_card_id: "dm23rp1-001", product_code: "DM23RP1" },
    { official_card_id: "unknown-001", product_code: "DMR16真" },
    { official_card_id: "dm23rp1+1s-001", product_code: "DM23RP1" },
  ]);
});
