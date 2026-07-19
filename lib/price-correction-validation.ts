import type { Database } from "./database.types";

type StockStatus = Database["public"]["Enums"]["stock_status"];

export type ValidatedPriceCorrection = {
  priceRecordId: number;
  salePrice: number | null;
  buyPrice: number | null;
  stockStatus: StockStatus;
  observedOn: string;
  note: string;
  reason: string;
};

const STOCK_STATUSES = new Set<StockStatus>([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unknown",
  "buying",
  "buying_paused",
]);

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return (
    year >= 1 &&
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function validatePriceCorrectionBody(
  input: unknown,
): ValidatedPriceCorrection | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const body = input as Record<string, unknown>;
  const priceRecordId = body.priceRecordId;
  const salePrice = optionalInteger(body.salePrice);
  const buyPrice = optionalInteger(body.buyPrice);
  const stockStatus = body.stockStatus;
  const observedOn = body.observedOn;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (
    typeof priceRecordId !== "number" ||
    !Number.isSafeInteger(priceRecordId) ||
    priceRecordId <= 0 ||
    salePrice === undefined ||
    buyPrice === undefined ||
    (salePrice === null && buyPrice === null) ||
    typeof stockStatus !== "string" ||
    !STOCK_STATUSES.has(stockStatus as StockStatus) ||
    !isIsoCalendarDate(observedOn) ||
    reason.length === 0 ||
    reason.length > 2000 ||
    note.length > 2000
  ) {
    return null;
  }

  return {
    priceRecordId,
    salePrice,
    buyPrice,
    stockStatus: stockStatus as StockStatus,
    observedOn,
    note,
    reason,
  };
}
