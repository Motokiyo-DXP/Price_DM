import assert from "node:assert/strict";
import test from "node:test";
import { imageStorageId, officialCardId, officialImageUrl, parseArguments } from "./sync-dm-card-images.mjs";

test("derives the official image URL from a card detail URL", () => {
  assert.equal(officialCardId("https://dm.takaratomy.co.jp/card/detail/?id=dm26rp1-S02"), "dm26rp1-S02");
  assert.equal(officialImageUrl("dm26rp1-S02"), "https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26rp1-S02.jpg");
});
test("preserves special official ids while creating a safe storage key", () => {
  assert.equal(officialCardId("https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-003"), "dm34+1s-003");
  assert.equal(officialCardId("https://dm.takaratomy.co.jp/card/detail/?id=dmrp07-s06$"), "dmrp07-s06$");
  assert.equal(imageStorageId("dm34+1s-003"), "dm34_plus_1s-003");
  assert.equal(imageStorageId("dmrp07-s06$"), "dmrp07-s06_dollar_");
});
test("rejects foreign and unsafe IDs", () => {
  assert.equal(officialCardId("https://example.com/card/detail/?id=dm26rp1-S02"), null);
  assert.equal(officialCardId("https://dm.takaratomy.co.jp/card/detail/?id=../secret"), null);
});
test("limits request concurrency and delay", () => {
  assert.equal(parseArguments(["--limit=10", "--concurrency=4", "--delay-ms=100"]).limit, 10);
  assert.throws(() => parseArguments(["--concurrency=5"]));
  assert.throws(() => parseArguments(["--delay-ms=99"]));
});
