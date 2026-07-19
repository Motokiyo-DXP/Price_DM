import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { validatePriceCorrectionBody } from "@/lib/price-correction-validation";
import { REGISTRATION_SESSION_COOKIE } from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CorrectionArgs =
  Database["public"]["Functions"]["submit_price_correction_request"]["Args"];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

  const correction = validatePriceCorrectionBody(body);
  if (!correction) return json({ error: "invalid_request" }, 400);

  const args = {
    p_buy_price: correction.buyPrice,
    p_note: correction.note,
    p_observed_on: correction.observedOn,
    p_price_record_id: correction.priceRecordId,
    p_reason: correction.reason,
    p_sale_price: correction.salePrice,
    p_session_token: sessionToken,
    p_stock_status: correction.stockStatus,
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
