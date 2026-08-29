import { NextResponse, type NextRequest } from "next/server";
import { createAuthRouteSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

function safeNext(request: NextRequest) {
  const next = new URL(request.url).searchParams.get("next");
  if (next === "/admin" || next === "/decks" || next === "/decks/new" || next === "/rooms") return next;
  if (next && /^\/(rooms|playtest)\/[0-9a-f-]{36}$/i.test(next)) return next;
  return "/decks";
}

function loginRedirect(request: NextRequest) {
  const destination = safeNext(request) === "/admin" ? "/admin/login?error=callback" : "/login?error=callback";
  return NextResponse.redirect(new URL(destination, request.url));
}

export async function GET(request: NextRequest) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return loginRedirect(request);

  const response = NextResponse.redirect(new URL(safeNext(request), request.url));
  const supabase = createAuthRouteSupabaseClient(request, response);
  if (!supabase) return loginRedirect(request);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginRedirect(request);

  return response;
}
