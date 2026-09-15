import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import {
  isRegistrationSessionToken,
  REGISTRATION_SESSION_COOKIE,
} from "@/lib/registration-session";
import { validateShopCandidateBody } from "@/lib/shop-candidate-validation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { hasRegistrationUser } from "@/lib/registration-auth";

export const dynamic = "force-dynamic";

type SubmitArgs =
  Database["public"]["Functions"]["submit_shop_candidate_session"]["Args"];

type SubmitResult = {
  status: "pending" | "already_approved" | "invalid_session";
  candidate_id?: number;
  shop_id?: number;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isSubmitResult(value: Json): value is SubmitResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value.status === "pending" ||
      value.status === "already_approved" ||
      value.status === "invalid_session")
  );
}

export async function POST(request: Request) {
  if (!(await hasRegistrationUser())) return json({ error: "session_required" }, 401);
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(REGISTRATION_SESSION_COOKIE)?.value;
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

  const candidate = validateShopCandidateBody(body);
  if (!candidate.ok) return json({ error: candidate.error }, 400);
  const { name, prefecture, municipality, addressLine, websiteUrl } =
    candidate.value;

  const args: SubmitArgs = {
    p_name: name,
    p_session_token: sessionToken,
  };
  if (prefecture) args.p_prefecture = prefecture;
  if (municipality) args.p_municipality = municipality;
  if (addressLine) args.p_address_line = addressLine;
  if (websiteUrl) args.p_website_url = websiteUrl;

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ error: "service_unavailable" }, 503);

  const { data, error } = await supabase.rpc(
    "submit_shop_candidate_session",
    args,
  );
  if (error || !isSubmitResult(data)) {
    console.error("Failed to submit a shop candidate", error?.code);
    return json({ error: "registration_failed" }, 400);
  }
  if (data.status === "invalid_session") {
    const response = json({ error: "session_required" }, 401);
    response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  return json(data, data.status === "pending" ? 202 : 200);
}
