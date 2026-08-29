import type { NextRequest } from "next/server";
import { refreshAuthSession } from "@/lib/supabase-auth";

export async function middleware(request: NextRequest) {
  return refreshAuthSession(request);
}

export const config = {
  matcher: ["/admin/:path*", "/decks/:path*", "/rooms/:path*", "/auth/callback"],
};
