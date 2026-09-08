import assert from "node:assert/strict";
import test from "node:test";
import { isCardFaceVisible } from "./playfield-visibility.ts";

const base = { face: "face_down", owner: "p1", view: "p2" };

test("対戦者には相手の非公開カードを表示しない", () => {
  assert.equal(isCardFaceVisible({ ...base, zone: "hand" }), false);
  assert.equal(isCardFaceVisible({ ...base, face: "owner_only", owner: "p1", view: "p1", zone: "hand" }), true);
});

test("観戦者には山札以外の非公開カードを表示する", () => {
  for (const zone of ["hand", "shield", "mana", "battle", "graveyard", "hyperspatial", "gr", "abyss", "reveal"]) {
    assert.equal(isCardFaceVisible({ ...base, revealHiddenCards: true, zone }), true, zone);
  }
});

test("観戦者にも山札の内容は表示しない", () => {
  assert.equal(isCardFaceVisible({ ...base, face: "face_up", revealHiddenCards: true, zone: "deck" }), false);
});
