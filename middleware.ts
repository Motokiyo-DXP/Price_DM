import type { NextRequest } from "next/server";
import { refreshAuthSession } from "@/lib/supabase-auth";

export async function middleware(request: NextRequest) {
  return refreshAuthSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/decks/:path*",
    "/rooms/:path*",
    "/register/:path*",
    "/api/registration-session",
    "/api/price-records",
    "/api/shop-candidates",
    "/auth/callback",
  ],
};
