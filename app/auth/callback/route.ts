import { NextResponse, type NextRequest } from "next/server";
import { createAuthRouteSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

function loginRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL("/admin/login?error=callback", request.url));
}

export async function GET(request: NextRequest) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return loginRedirect(request);

  const response = NextResponse.redirect(new URL("/admin", request.url));
  const supabase = createAuthRouteSupabaseClient(request, response);
  if (!supabase) return loginRedirect(request);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginRedirect(request);

  return response;
}
