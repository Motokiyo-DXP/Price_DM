import assert from "node:assert/strict";
import test from "node:test";

import { validateCardCatalog } from "./validate-dm-card-import.mjs";

const CARD = {
  name: "テストカード",
  official_url: "https://dm.takaratomy.co.jp/card/detail/?id=test-1",
  card_number: "1/100",
  product_name: "テスト商品",
};

test("完了済み公式カタログの件数と対象項目を検証する", () => {
  assert.deepEqual(
    validateCardCatalog(
      [CARD],
      {
        complete: true,
        crawl_complete: true,
        failures_pending: 0,
        total_available: 1,
      },
      [],
    ),
    {
      card_print_count: 1,
      canonical_name_count: 1,
      duplicate_official_id_count: 0,
      pending_failure_count: 0,
      complete: true,
      total_available: 1,
      unavailable_official_page_count: 0,
      forbidden_fields_present: false,
    },
  );
});

test("公式ページに名称がないプレースホルダーを全件件数へ含める", () => {
  const unavailable = [
    {
      official_url:
        "https://dm.takaratomy.co.jp/card/detail/?id=dmex08-022",
      reason: "official_page_has_no_published_card_name",
    },
  ];
  const result = validateCardCatalog(
    [CARD],
    {
      complete: true,
      crawl_complete: true,
      failures_pending: 0,
      total_available: 2,
    },
    [],
    unavailable,
  );
  assert.equal(result.card_print_count, 1);
  assert.equal(result.unavailable_official_page_count, 1);
});

test("重複ID、不正URL、画像等の禁止項目を拒否する", () => {
  const checkpoint = { complete: false, total_available: 2 };
  assert.throws(
    () => validateCardCatalog([CARD, CARD], checkpoint),
    /Duplicate official card id/,
  );
  assert.throws(
    () =>
      validateCardCatalog(
        [{ ...CARD, official_url: "https://example.com/card?id=test-1" }],
        checkpoint,
      ),
    /invalid official URL/,
  );
  assert.throws(
    () => validateCardCatalog([{ ...CARD, image_url: "secret" }], checkpoint),
    /forbidden field/,
  );
});
