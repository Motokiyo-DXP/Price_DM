import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { priceRegistrationRpcErrorCode } from "@/lib/price-registration-error";
import { validatePriceRecordBody } from "@/lib/price-record-validation";
import {
  isRegistrationSessionToken,
  REGISTRATION_SESSION_COOKIE,
} from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SessionSubmitArgs =
  Database["public"]["Functions"]["submit_price_record_session_v3"]["Args"];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(REGISTRATION_SESSION_COOKIE)?.value;
  if (!isRegistrationSessionToken(sessionToken)) {
    const response = json({ error: "session_required" }, 401);
    if (sessionToken) response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const validation = validatePriceRecordBody(input);
  if (!validation.ok) return json({ error: validation.error }, 400);
  const priceRecord = validation.value;

  const args: SessionSubmitArgs = {
    p_attribute_slugs: priceRecord.attributeSlugs,
    p_canonical_card_id: priceRecord.canonicalCardId,
    p_observed_on: priceRecord.observedOn,
    p_session_token: sessionToken,
    p_shop_id: priceRecord.shopId,
    p_stock_status: priceRecord.stockStatus,
  };
  if (priceRecord.cardPrintId !== null) {
    args.p_card_print_id = priceRecord.cardPrintId;
  }
  if (priceRecord.salePrice !== null) args.p_sale_price = priceRecord.salePrice;
  if (priceRecord.buyPrice !== null) args.p_buy_price = priceRecord.buyPrice;
  if (priceRecord.contributorName) {
    args.p_contributor_name = priceRecord.contributorName;
  }
  if (priceRecord.note) args.p_note = priceRecord.note;

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ error: "service_unavailable" }, 503);

  const { data: recordId, error } = await supabase.rpc(
    "submit_price_record_session_v3",
    args,
  );
  if (error) {
    console.error("Failed to register a price record", error.code);
    const publicError = priceRegistrationRpcErrorCode(error);
    const status = publicError === "service_unavailable" ? 503 : 400;
    return json({ error: publicError }, status);
  }
  if (recordId === -4) {
    const response = json({ error: "session_required" }, 401);
    response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }
  if (recordId === -5) return json({ error: "invalid_shop" }, 400);
  if (recordId === -2) return json({ error: "rate_limited" }, 429);
  if (recordId === null || recordId <= 0) {
    return json({ error: "registration_failed" }, 400);
  }

  return json({ recordId }, 201);
}
