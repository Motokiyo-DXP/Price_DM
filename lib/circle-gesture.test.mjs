import assert from "node:assert/strict";
import test from "node:test";
import { isCircleGesture } from "./circle-gesture.ts";

test("閉じた円をシャッフルジェスチャーとして認識する", () => {
  const points = Array.from({ length: 25 }, (_, index) => { const angle = index / 24 * Math.PI * 2; return { x: 100 + Math.cos(angle) * 45, y: 100 + Math.sin(angle) * 45 }; });
  assert.equal(isCircleGesture(points), true);
  assert.equal(isCircleGesture([{ x: 0, y: 0 }, { x: 100, y: 0 }]), false);
});
