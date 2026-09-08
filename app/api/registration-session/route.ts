import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isRegistrationSessionToken,
  REGISTRATION_SESSION_COOKIE,
  REGISTRATION_SESSION_MAX_AGE,
} from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { parseRegistrationSessionRpcResult } from "@/lib/registration-response-validation";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REGISTRATION_SESSION_COOKIE)?.value;
  if (token && !isRegistrationSessionToken(token)) {
    const response = json({ authenticated: false });
    response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ authenticated: false }, 503);

  if (token) {
    const { data: expiresAt, error } = await supabase.rpc(
      "validate_registration_session",
      { p_session_token: token },
    );
    if (!error && expiresAt) return json({ authenticated: true, expiresAt });
  }

  const authSupabase = await createAuthServerSupabaseClient();
  const { data: claims } = authSupabase
    ? await authSupabase.auth.getClaims()
    : { data: null };
  if (!authSupabase || typeof claims?.claims?.sub !== "string") {
    const response = json({ authenticated: false });
    if (token) response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  const { data, error } = await authSupabase.rpc("create_registration_session", {
    p_pin: "",
  });
  const session = parseRegistrationSessionRpcResult(data);
  if (error || !session || session.status !== "ok") {
    return json({ authenticated: false }, 503);
  }

  const response = json({ authenticated: true, expiresAt: session.expiresAt });
  response.cookies.set(REGISTRATION_SESSION_COOKIE, session.sessionToken, {
    httpOnly: true,
    maxAge: REGISTRATION_SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function POST(request: Request) {
  let token: unknown;
  try {
    ({ token } = (await request.json()) as { token?: unknown });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (!isRegistrationSessionToken(token)) {
    return json({ error: "invalid_session" }, 400);
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ error: "service_unavailable" }, 503);

  const { data: expiresAt, error } = await supabase.rpc(
    "validate_registration_session",
    { p_session_token: token },
  );
  if (error || !expiresAt) return json({ error: "invalid_session" }, 401);

  const response = json({ authenticated: true, expiresAt });
  response.cookies.set(REGISTRATION_SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: REGISTRATION_SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function DELETE() {
  const response = json({ authenticated: false });
  response.cookies.delete(REGISTRATION_SESSION_COOKIE);
  return response;
}

