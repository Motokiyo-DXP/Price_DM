import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isRegistrationSessionToken,
  REGISTRATION_SESSION_COOKIE,
  REGISTRATION_SESSION_MAX_AGE,
} from "@/lib/registration-session";
import { createServerSupabaseClient } from "@/lib/supabase";

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
  if (!token) return json({ authenticated: false });
  if (!isRegistrationSessionToken(token)) {
    const response = json({ authenticated: false });
    response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ authenticated: false }, 503);

  const { data: expiresAt, error } = await supabase.rpc(
    "validate_registration_session",
    { p_session_token: token },
  );

  if (error || !expiresAt) {
    const response = json({ authenticated: false });
    response.cookies.delete(REGISTRATION_SESSION_COOKIE);
    return response;
  }

  return json({ authenticated: true, expiresAt });
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

