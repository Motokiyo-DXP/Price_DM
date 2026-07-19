import type { Database } from "./database.types";
import {
  isIsoCalendarDate,
  STOCK_STATUSES,
} from "./price-input-validation.ts";

type CorrectionRow =
  Database["public"]["Functions"]["list_pending_price_corrections_for_admin"]["Returns"][number];
type StockStatus = Database["public"]["Enums"]["stock_status"];

export type AdminPriceCorrection = Omit<
  CorrectionRow,
  | "original_buy_price"
  | "original_sale_price"
  | "proposed_buy_price"
  | "proposed_note"
  | "proposed_sale_price"
> & {
  original_buy_price: number | null;
  original_sale_price: number | null;
  proposed_buy_price: number | null;
  proposed_note: string | null;
  proposed_sale_price: number | null;
};

type AdminRpcClient = {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

function adminRpcClient(client: unknown) {
  return client as AdminRpcClient;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNullablePrice(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function parseCorrection(value: unknown): AdminPriceCorrection | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = row.id;
  const priceRecordId = row.price_record_id;
  const originalSalePrice = row.original_sale_price;
  const originalBuyPrice = row.original_buy_price;
  const proposedSalePrice = row.proposed_sale_price;
  const proposedBuyPrice = row.proposed_buy_price;
  const proposedStockStatus = row.proposed_stock_status;
  const proposedObservedOn = row.proposed_observed_on;
  const proposedNote = row.proposed_note;
  const submittedAt = row.submitted_at;
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof priceRecordId !== "number" ||
    !Number.isSafeInteger(priceRecordId) ||
    priceRecordId <= 0 ||
    typeof row.card_name !== "string" ||
    typeof row.shop_name !== "string" ||
    !isNullablePrice(originalSalePrice) ||
    !isNullablePrice(originalBuyPrice) ||
    !isNullablePrice(proposedSalePrice) ||
    !isNullablePrice(proposedBuyPrice) ||
    (proposedSalePrice === null && proposedBuyPrice === null) ||
    typeof proposedStockStatus !== "string" ||
    !STOCK_STATUSES.has(proposedStockStatus as StockStatus) ||
    !isIsoCalendarDate(proposedObservedOn) ||
    (proposedNote !== null && typeof proposedNote !== "string") ||
    typeof row.reason !== "string" ||
    typeof submittedAt !== "string" ||
    Number.isNaN(Date.parse(submittedAt))
  ) {
    return null;
  }

  return {
    card_name: row.card_name,
    id,
    original_buy_price: originalBuyPrice,
    original_sale_price: originalSalePrice,
    price_record_id: priceRecordId,
    proposed_buy_price: proposedBuyPrice,
    proposed_note: proposedNote,
    proposed_observed_on: proposedObservedOn,
    proposed_sale_price: proposedSalePrice,
    proposed_stock_status: proposedStockStatus as StockStatus,
    reason: row.reason,
    shop_name: row.shop_name,
    submitted_at: submittedAt,
  };
}

export async function loadPendingPriceCorrections(client: unknown) {
  const { data, error } = await adminRpcClient(client).rpc(
    "list_pending_price_corrections_for_admin",
    { p_limit: 100 },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data)) throw new Error("invalid_admin_correction_response");
  const corrections = data.map(parseCorrection);
  if (corrections.some((correction) => correction === null)) {
    throw new Error("invalid_admin_correction_response");
  }
  return corrections as AdminPriceCorrection[];
}

export async function reviewPriceCorrection(
  client: unknown,
  input: { requestId: number; decision: "approved" | "rejected"; reviewNote: string },
) {
  const { error } = await adminRpcClient(client).rpc(
    "review_price_correction_for_admin",
    {
      p_decision: input.decision,
      p_request_id: input.requestId,
      p_review_note: input.reviewNote || undefined,
    },
  );
  if (error) throw new Error(error.code ?? error.message);
}
