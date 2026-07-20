import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeFavoriteCardIds,
  readFavoriteCardIds,
  toggleFavoriteCardId,
  writeFavoriteCardIds,
} from "./favorite-cards.ts";

function memoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, "tcg-favorites");
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, "tcg-favorites");
      value = nextValue;
    },
    value() {
      return value;
    },
  };
}

test("お気に入りIDを検証し重複を除去する", () => {
  assert.deepEqual(
    normalizeFavoriteCardIds([
      "438",
      "438",
      "878",
      "0",
      "01",
      "1e2",
      String(Number.MAX_SAFE_INTEGER + 1),
      123,
      null,
    ]),
    ["438", "878"],
  );
});

test("保存済みのお気に入りを安全に読み込む", () => {
  const storage = memoryStorage('["438","438","878","invalid"]');
  assert.deepEqual(readFavoriteCardIds(() => storage), ["438", "878"]);
});

test("壊れたJSONと利用不能な保存領域を空配列として扱う", () => {
  assert.deepEqual(
    readFavoriteCardIds(() => memoryStorage("not-json")),
    [],
  );
  assert.deepEqual(
    readFavoriteCardIds(() => {
      throw new Error("storage unavailable");
    }),
    [],
  );
  assert.deepEqual(
    readFavoriteCardIds(() => ({
      getItem() {
        throw new Error("read denied");
      },
      setItem() {},
    })),
    [],
  );
});

test("検証済みIDだけを書き込み保存失敗を通知する", () => {
  const storage = memoryStorage();
  assert.equal(
    writeFavoriteCardIds(["438", "438", "invalid"], () => storage),
    true,
  );
  assert.equal(storage.value(), '["438"]');

  assert.equal(
    writeFavoriteCardIds(["438"], () => ({
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota exceeded");
      },
    })),
    false,
  );
});

test("お気に入りを追加・解除し不正IDを無視する", () => {
  assert.deepEqual(toggleFavoriteCardId(["438"], "878"), ["438", "878"]);
  assert.deepEqual(toggleFavoriteCardId(["438", "878"], "438"), ["878"]);
  assert.deepEqual(toggleFavoriteCardId(["438"], "01"), ["438"]);
});

test("お気に入り件数を端末負荷の上限以内に制限する", () => {
  const ids = Array.from({ length: 600 }, (_, index) => String(index + 1));
  const favorites = normalizeFavoriteCardIds(ids);
  assert.equal(favorites.length, 500);
  assert.equal(favorites.at(-1), "500");
});
