import type { Database } from "./database.types";

type StockStatus = Database["public"]["Enums"]["stock_status"];

export const STOCK_STATUSES: ReadonlySet<StockStatus> = new Set([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unknown",
  "buying",
  "buying_paused",
]);

export function normalizePriceInput(value: string) {
  return value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, 9);
}

export function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function isIsoCalendarDate(value: unknown): value is string {
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
