import type { Database } from "./database.types";
import {
  isIsoCalendarDate,
  optionalInteger,
  STOCK_STATUSES,
} from "./price-input-validation.ts";

type StockStatus = Database["public"]["Enums"]["stock_status"];

export type ValidatedPriceRecord = {
  canonicalCardId: number;
  cardPrintId: number | null;
  shopId: number;
  salePrice: number | null;
  buyPrice: number | null;
  stockStatus: StockStatus;
  observedOn: string;
  contributorName: string;
  note: string;
  attributeSlugs: string[];
};

export type PriceRecordValidationResult =
  | { ok: true; value: ValidatedPriceRecord }
  | {
      ok: false;
      error:
        | "invalid_request"
        | "card_required"
        | "invalid_shop"
        | "invalid_price"
        | "price_required"
        | "invalid_stock_status"
        | "invalid_date"
        | "too_long";
    };

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

export function validatePriceRecordBody(
  input: unknown,
): PriceRecordValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "invalid_request" };
  }

  const body = input as Record<string, unknown>;
  const canonicalCardId = body.canonicalCardId;
  const cardPrintId = optionalInteger(body.cardPrintId);
  const shopId = body.shopId;
  const salePrice = optionalInteger(body.salePrice);
  const buyPrice = optionalInteger(body.buyPrice);
  const stockStatus = body.stockStatus;
  const observedOn = body.observedOn;
  const contributorName =
    typeof body.contributorName === "string" ? body.contributorName.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!isPositiveInteger(canonicalCardId)) {
    return { ok: false, error: "card_required" };
  }
  if (cardPrintId === undefined || (cardPrintId !== null && cardPrintId <= 0)) {
    return { ok: false, error: "invalid_request" };
  }
  if (!isPositiveInteger(shopId)) {
    return { ok: false, error: "invalid_shop" };
  }
  if (salePrice === undefined || buyPrice === undefined) {
    return { ok: false, error: "invalid_price" };
  }
  if (salePrice === null && buyPrice === null) {
    return { ok: false, error: "price_required" };
  }
  if (
    typeof stockStatus !== "string" ||
    !STOCK_STATUSES.has(stockStatus as StockStatus)
  ) {
    return { ok: false, error: "invalid_stock_status" };
  }
  if (!isIsoCalendarDate(observedOn)) {
    return { ok: false, error: "invalid_date" };
  }
  if (contributorName.length > 100 || note.length > 2000) {
    return { ok: false, error: "too_long" };
  }

  const rawAttributeSlugs = body.attributeSlugs;
  if (
    rawAttributeSlugs !== undefined &&
    !Array.isArray(rawAttributeSlugs)
  ) {
    return { ok: false, error: "invalid_request" };
  }
  const attributeSlugs = rawAttributeSlugs ?? [];
  if (
    attributeSlugs.length > 10 ||
    attributeSlugs.some(
      (value) =>
        typeof value !== "string" || !/^[a-z0-9_]{1,50}$/.test(value),
    )
  ) {
    return { ok: false, error: "invalid_request" };
  }

  return {
    ok: true,
    value: {
      canonicalCardId,
      cardPrintId,
      shopId,
      salePrice,
      buyPrice,
      stockStatus: stockStatus as StockStatus,
      observedOn,
      contributorName,
      note,
      attributeSlugs: [...new Set(attributeSlugs)],
    },
  };
}
