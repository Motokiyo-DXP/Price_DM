import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeJapaneseSearch,
  normalizeShopSearch,
  searchTextMatches,
} from "./search-normalization.ts";

test("全半角、カタカナ、英字大小、空白、中点を検索用に正規化する", () => {
  assert.equal(
    normalizeJapaneseSearch(" ＢＯＬ・シャック　ドラゴン "),
    "bolしゃっくどらごん",
  );
  assert.equal(
    normalizeJapaneseSearch("ﾊﾟｰﾌｪｸﾄ･ｱﾙｶﾃﾞｨｱ"),
    "ぱーふぇくとあるかでぃあ",
  );
  assert.equal(normalizeJapaneseSearch("ヽヾ"), "ゝゞ");
});

test("店舗検索ではハイフン類を無視し、flatをフラットとして扱う", () => {
  assert.equal(normalizeShopSearch("カード・ショップ－秋葉原"), "かどしょっぷあきはばら");
  assert.equal(normalizeShopSearch("flat 工房"), "ふらっとこうぼう");
  assert.equal(normalizeShopSearch("ＦＬＡＴ－工房"), "ふらっとこうぼう");
  assert.equal(
    normalizeShopSearch("ホビーステーション 秋葉原本店"),
    normalizeShopSearch("ほびーすてーしょん あきはばらほんてん"),
  );
  assert.equal(
    normalizeShopSearch("magi秋葉原ラジオ会館店"),
    normalizeShopSearch("magiあきはばららじおかいかんてん"),
  );
});

test("空の検索語は候補の有無にかかわらず一致する", () => {
  assert.equal(searchTextMatches(" ・・ ", [], "broad"), true);
  assert.equal(searchTextMatches("", [null, undefined], "precise"), true);
});

test("完全一致と部分一致は両方の検索モードで一致する", () => {
  for (const mode of ["broad", "precise"]) {
    assert.equal(
      searchTextMatches("ボルシャック", ["ボルシャック"], mode),
      true,
    );
    assert.equal(
      searchTextMatches(
        "シャック",
        ["ボルシャック・ドラゴン", null],
        mode,
      ),
      true,
    );
  }
});

test("表記差を正規化して読み・別名候補へ一致させる", () => {
  assert.equal(
    searchTextMatches(
      "ぱーふぇくと あるかでぃあ",
      ["パーフェクト・アルカディア", "理想と平和の決断"],
      "precise",
    ),
    true,
  );
});

test("1文字の表記違いはざっくり検索だけで一致する", () => {
  const candidates = ["ボルシャック"];
  assert.equal(searchTextMatches("ボルシヤック", candidates, "broad"), true);
  assert.equal(searchTextMatches("ボルシヤック", candidates, "precise"), false);
});

test("無関係または空の候補には一致しない", () => {
  assert.equal(
    searchTextMatches("アルカディア", ["ボルシャック", null, ""], "broad"),
    false,
  );
  assert.equal(searchTextMatches("カード", [null, undefined], "precise"), false);
});
