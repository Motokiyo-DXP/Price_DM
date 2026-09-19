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
  let token = cookieStore.get(REGISTRATION_SESSION_COOKIE)?.value;
  const hasInvalidSessionToken = Boolean(
    token && !isRegistrationSessionToken(token),
  );
  const authSupabase = await createAuthServerSupabaseClient();
  const { data: claims, error: authError } = authSupabase
    ? await authSupabase.auth.getClaims()
    : { data: null, error: null };
  if (!authSupabase || authError || typeof claims?.claims?.sub !== "string") {
    const response = json({ authenticated: false }, 401);
    if (token) response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }
  // A valid Supabase login can safely replace a malformed local session token.
  if (hasInvalidSessionToken) token = undefined;

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    const response = json({ authenticated: false }, 503);
    if (hasInvalidSessionToken) {
      response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    }
    return response;
  }

  if (token) {
    const { data: expiresAt, error } = await supabase.rpc(
      "validate_registration_session",
      { p_session_token: token },
    );
    if (!error && expiresAt) return json({ authenticated: true, expiresAt });
  }

  const { data, error } = await authSupabase.rpc("create_registration_session", {
    p_pin: "",
  });
  const session = parseRegistrationSessionRpcResult(data);
  if (error || !session || session.status !== "ok") {
    const response = json({ authenticated: false }, 503);
    if (hasInvalidSessionToken) {
      response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    }
    return response;
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
