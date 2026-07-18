import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { REGISTRATION_SESSION_COOKIE } from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type StockStatus = Database["public"]["Enums"]["stock_status"];
type SessionSubmitArgs =
  Database["public"]["Functions"]["submit_price_record_session_v2"]["Args"];

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
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(REGISTRATION_SESSION_COOKIE)?.value;
  if (!sessionToken) return json({ error: "session_required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

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
  const attributeSlugs = Array.isArray(body.attributeSlugs)
    ? body.attributeSlugs.filter(
        (value): value is string =>
          typeof value === "string" && /^[a-z0-9_]{1,50}$/.test(value),
      )
    : [];

  if (
    typeof canonicalCardId !== "number" ||
    !Number.isSafeInteger(canonicalCardId) ||
    canonicalCardId <= 0
  ) {
    return json({ error: "card_required" }, 400);
  }
  if (cardPrintId === undefined || (cardPrintId !== null && cardPrintId <= 0)) {
    return json({ error: "invalid_request" }, 400);
  }
  if (
    typeof shopId !== "number" ||
    !Number.isSafeInteger(shopId) ||
    shopId <= 0
  ) {
    return json({ error: "invalid_shop" }, 400);
  }
  if (salePrice === undefined || buyPrice === undefined) {
    return json({ error: "invalid_price" }, 400);
  }
  if (salePrice === null && buyPrice === null) {
    return json({ error: "price_required" }, 400);
  }
  if (typeof stockStatus !== "string" || !STOCK_STATUSES.has(stockStatus as StockStatus)) {
    return json({ error: "invalid_stock_status" }, 400);
  }
  if (typeof observedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) {
    return json({ error: "invalid_date" }, 400);
  }
  if (contributorName.length > 100 || note.length > 2000) {
    return json({ error: "too_long" }, 400);
  }
  if (
    attributeSlugs.length > 10 ||
    (Array.isArray(body.attributeSlugs) &&
      attributeSlugs.length !== body.attributeSlugs.length)
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  const args: SessionSubmitArgs = {
    p_attribute_slugs: [...new Set(attributeSlugs)],
    p_canonical_card_id: Number(canonicalCardId),
    p_observed_on: observedOn,
    p_session_token: sessionToken,
    p_shop_name: "",
    p_stock_status: stockStatus as StockStatus,
  };
  if (cardPrintId !== null) args.p_card_print_id = cardPrintId;
  if (salePrice !== null) args.p_sale_price = salePrice;
  if (buyPrice !== null) args.p_buy_price = buyPrice;
  if (contributorName) args.p_contributor_name = contributorName;
  if (note) args.p_note = note;

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ error: "service_unavailable" }, 503);

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop) {
    return json({ error: "invalid_shop" }, 400);
  }

  args.p_shop_name = shop.name;

  const { data: recordId, error } = await supabase.rpc(
    "submit_price_record_session_v2",
    args,
  );
  if (error) {
    console.error("Failed to register a price record", error.code);
    return json({ error: "registration_failed" }, 400);
  }
  if (recordId === -4) {
    const response = json({ error: "session_required" }, 401);
    response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }
  if (recordId === -2) return json({ error: "rate_limited" }, 429);
  if (recordId === null || recordId <= 0) {
    return json({ error: "registration_failed" }, 400);
  }

  return json({ recordId }, 201);
}
