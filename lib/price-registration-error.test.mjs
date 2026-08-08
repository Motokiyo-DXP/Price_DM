import assert from "node:assert/strict";
import test from "node:test";
import { priceRegistrationRpcErrorCode } from "./price-registration-error.ts";

test("利用者が修正できるDBエラーを安全な公開コードへ変換する", () => {
  const cases = [
    ["canonical_card_not_found", "card_unavailable"],
    ["card_print_not_found_or_mismatch", "card_print_unavailable"],
    ["canonical_card_has_no_legacy_print", "card_registration_incomplete"],
    ["invalid_price_attribute", "invalid_price_attribute"],
    ["at_least_one_price_required", "price_required"],
    ["price_must_be_nonnegative", "invalid_price"],
    ["contributor_name_too_long", "too_long"],
    ["note_too_long", "too_long"],
  ];

  for (const [message, expected] of cases) {
    assert.equal(priceRegistrationRpcErrorCode({ code: "P0001", message }), expected);
  }
});

test("制約違反と接続障害を分類する", () => {
  assert.equal(
    priceRegistrationRpcErrorCode({ code: "23503", message: "internal detail" }),
    "referenced_data_changed",
  );
  assert.equal(
    priceRegistrationRpcErrorCode({ code: "22P02", message: "internal detail" }),
    "invalid_request",
  );
  assert.equal(
    priceRegistrationRpcErrorCode({ code: "PGRST003", message: "internal detail" }),
    "service_unavailable",
  );
});

test("未知の内部エラーの詳細を公開しない", () => {
  assert.equal(
    priceRegistrationRpcErrorCode({ code: "XX000", message: "secret internal detail" }),
    "registration_failed",
  );
  assert.equal(priceRegistrationRpcErrorCode({}), "registration_failed");
});
