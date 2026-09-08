import assert from "node:assert/strict";
import test from "node:test";
import { fitCardStage } from "./card-stage.ts";

const BASE_WIDTH = 500;
const BASE_HEIGHT = 700;

for (const sample of [
  { label: "非常に大きい", viewport: [1_000, 1_400], scale: 2 },
  { label: "通常", viewport: [500, 700], scale: 1 },
  { label: "50%", viewport: [250, 350], scale: 0.5 },
  { label: "非常に小さい", viewport: [50, 70], scale: 0.1 },
  { label: "横長", viewport: [800, 200], scale: 2 / 7 },
  { label: "縦長", viewport: [200, 800], scale: 0.4 },
]) {
  test(`${sample.label}のviewportへカードstage全体を均一に収める`, () => {
    const [width, height] = sample.viewport;
    const fit = fitCardStage(width, height, BASE_WIDTH, BASE_HEIGHT);

    assert.ok(Math.abs(fit.scale - sample.scale) < 1e-12);
    assert.ok(fit.width <= width + 1e-12);
    assert.ok(fit.height <= height + 1e-12);
    assert.ok(Math.abs(fit.width / fit.height - BASE_WIDTH / BASE_HEIGHT) < 1e-12);
  });
}

test("未計測または無効な寸法では描画倍率を0にする", () => {
  assert.deepEqual(fitCardStage(0, 100, BASE_WIDTH, BASE_HEIGHT), { height: 0, scale: 0, width: 0 });
  assert.deepEqual(fitCardStage(100, Number.NaN, BASE_WIDTH, BASE_HEIGHT), { height: 0, scale: 0, width: 0 });
});
