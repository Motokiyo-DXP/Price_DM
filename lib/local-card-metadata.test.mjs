import assert from "node:assert/strict";
import test from "node:test";

import { parseOfficialCardCost } from "./local-card-metadata.ts";

test("公式カード詳細の半角・全角コストを数値化する", () => {
  assert.equal(parseOfficialCardCost('<table class="cardDetail"><tr><td class="cost">5</td></tr></table>'), 5);
  assert.equal(parseOfficialCardCost('<table class="cardDetail"><tr><td class="cost">９</td></tr></table>'), 9);
});

test("無限・空欄コストは数値カードの後ろへ送るためnullにする", () => {
  assert.equal(parseOfficialCardCost('<table class="cardDetail"><tr><td class="cost">∞</td></tr></table>'), null);
  assert.equal(parseOfficialCardCost('<table class="cardDetail"><tr><td class="cost"></td></tr></table>'), null);
});
