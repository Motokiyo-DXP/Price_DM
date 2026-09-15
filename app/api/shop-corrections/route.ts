import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import {
  isRegistrationSessionToken,
  REGISTRATION_SESSION_COOKIE,
} from "@/lib/registration-session";
import { validateShopCorrectionBody } from "@/lib/shop-correction-validation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { hasRegistrationUser } from "@/lib/registration-auth";

export const dynamic = "force-dynamic";

type SubmitArgs =
  Database["public"]["Functions"]["submit_shop_correction_request"]["Args"];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!(await hasRegistrationUser())) return json({ error: "session_required" }, 401);
  const sessionToken = (await cookies()).get(REGISTRATION_SESSION_COOKIE)?.value;
  if (!isRegistrationSessionToken(sessionToken)) {
    const response = json({ error: "session_required" }, 401);
    if (sessionToken) response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const correction = validateShopCorrectionBody(body);
  if (!correction.ok) return json({ error: correction.error }, 400);

  const value = correction.value;
  const args: SubmitArgs = {
    p_session_token: sessionToken,
    p_shop_id: value.shopId,
    p_reason: value.reason,
  };
  if (value.name) args.p_name = value.name;
  if (value.nameKana) args.p_name_kana = value.nameKana;
  if (value.aliases.length > 0) args.p_aliases = value.aliases;
  if (value.prefecture) args.p_prefecture = value.prefecture;
  if (value.municipality) args.p_municipality = value.municipality;
  if (value.addressLine) args.p_address_line = value.addressLine;
  if (value.websiteUrl) args.p_website_url = value.websiteUrl;

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ error: "service_unavailable" }, 503);

  const { data: requestId, error } = await supabase.rpc(
    "submit_shop_correction_request",
    args,
  );
  if (error || requestId === null || requestId <= 0) {
    if (requestId === -4) return json({ error: "session_required" }, 401);
    if (requestId === -2) return json({ error: "already_pending" }, 409);
    if (requestId === -5) return json({ error: "shop_unavailable" }, 404);
    return json({ error: "submission_failed" }, 400);
  }

  return json({ requestId }, 201);
}
