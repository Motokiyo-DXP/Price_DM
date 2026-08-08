type RpcErrorLike = {
  code?: unknown;
  message?: unknown;
};

const MESSAGE_TO_PUBLIC_ERROR: Record<string, string> = {
  at_least_one_price_required: "price_required",
  canonical_card_has_no_legacy_print: "card_registration_incomplete",
  canonical_card_not_found: "card_unavailable",
  card_print_not_found_or_mismatch: "card_print_unavailable",
  contributor_name_too_long: "too_long",
  invalid_price_attribute: "invalid_price_attribute",
  note_too_long: "too_long",
  price_must_be_nonnegative: "invalid_price",
};

const INVALID_INPUT_CODES = new Set(["22003", "22007", "22008", "22P02", "23514"]);

export function priceRegistrationRpcErrorCode(error: RpcErrorLike): string {
  const message = typeof error.message === "string" ? error.message.trim() : "";
  const mappedMessage = MESSAGE_TO_PUBLIC_ERROR[message];
  if (mappedMessage) return mappedMessage;

  const code = typeof error.code === "string" ? error.code : "";
  if (code === "23503") return "referenced_data_changed";
  if (INVALID_INPUT_CODES.has(code)) return "invalid_request";
  if (code.startsWith("08") || code.startsWith("PGRST")) {
    return "service_unavailable";
  }

  return "registration_failed";
}
