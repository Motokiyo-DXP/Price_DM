import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { REGISTRATION_SESSION_COOKIE } from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";

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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(REGISTRATION_SESSION_COOKIE)?.value;
  if (!sessionToken) return json({ error: "session_required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const name = text(body.name);
  const prefecture = text(body.prefecture);
  const municipality = text(body.municipality);
  const addressLine = text(body.addressLine);
  const websiteUrl = text(body.websiteUrl);

  if (!name || name.length > 200) {
    return json({ error: "invalid_shop" }, 400);
  }
  if (
    prefecture.length > 20 ||
    municipality.length > 100 ||
    addressLine.length > 300 ||
    websiteUrl.length > 500
  ) {
    return json({ error: "too_long" }, 400);
  }
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
    return json({ error: "invalid_website_url" }, 400);
  }

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
