import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { REGISTRATION_SESSION_COOKIE } from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type StockStatus = Database["public"]["Enums"]["stock_status"];
type CorrectionArgs =
  Database["public"]["Functions"]["submit_price_correction_request"]["Args"];

const STOCK_STATUSES = new Set<StockStatus>([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unknown",
  "buying",
  "buying_paused",
]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export async function POST(request: Request) {
  const sessionToken = (await cookies()).get(REGISTRATION_SESSION_COOKIE)?.value;
  if (!sessionToken) return json({ error: "session_required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

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
    typeof observedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(observedOn) ||
    reason.length === 0 ||
    reason.length > 2000 ||
    note.length > 2000
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  const args = {
    p_buy_price: buyPrice,
    p_note: note,
    p_observed_on: observedOn,
    p_price_record_id: priceRecordId,
    p_reason: reason,
    p_sale_price: salePrice,
    p_session_token: sessionToken,
    p_stock_status: stockStatus as StockStatus,
  } as CorrectionArgs;
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ error: "service_unavailable" }, 503);

  const { data: requestId, error } = await supabase.rpc(
    "submit_price_correction_request",
    args,
  );
  if (error || requestId === null || requestId <= 0) {
    if (requestId === -4) return json({ error: "session_required" }, 401);
    if (requestId === -2) return json({ error: "already_pending" }, 409);
    if (requestId === -5) return json({ error: "price_record_unavailable" }, 404);
    return json({ error: "submission_failed" }, 400);
  }

  return json({ requestId }, 201);
}
