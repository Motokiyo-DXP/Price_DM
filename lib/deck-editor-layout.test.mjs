import assert from "node:assert/strict";
import test from "node:test";

import { constrainDeckPanePercent, getAnalysisTrackPercent, getDeckPreviewMinimumWidth, resolveAnalysisResize } from "./deck-editor-layout.ts";

test("プレビュー最小幅は領域高に追従し、右側ペインを残す幅で上限を持つ", () => {
  assert.equal(getDeckPreviewMinimumWidth(1600, 700), 684);
  assert.equal(getDeckPreviewMinimumWidth(900, 700), 456);
  assert.equal(constrainDeckPanePercent(0, 1600, 700), 684 / 1576 * 100);
  assert.equal(constrainDeckPanePercent(100, 1600, 700), (1576 - 420) / 1576 * 100);
});

test("分析の境界は通常リサイズの上限で分析最小高に止まり、上へ進むと検索を重ねる", () => {
  assert.deepEqual(resolveAnalysisResize(700, 224), { mode: "normal", analysisHeight: 220, searchOverlap: 0 });
  assert.deepEqual(resolveAnalysisResize(700, 120), { mode: "overlay", analysisHeight: 220, searchOverlap: 104 });
  assert.deepEqual(resolveAnalysisResize(700, -20), { mode: "overlay", analysisHeight: 220, searchOverlap: 220 });
});

test("分析境界を下へ戻すとオーバーレイを解除し、検索の最小高で止まる", () => {
  assert.deepEqual(resolveAnalysisResize(700, 244), { mode: "normal", analysisHeight: 240, searchOverlap: 0 });
  assert.deepEqual(resolveAnalysisResize(700, 900), { mode: "normal", analysisHeight: 452, searchOverlap: 0 });
  assert.equal(getAnalysisTrackPercent(220, 700), 0);
  assert.equal(getAnalysisTrackPercent(452, 700), 100);
});
