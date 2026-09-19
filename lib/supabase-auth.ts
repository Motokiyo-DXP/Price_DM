import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey || url.includes("YOUR_PROJECT")) return null;
  return { url, publishableKey };
}

export async function createAuthServerSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        } catch {
          // Server Components cannot set cookies. middleware.ts refreshes them.
        }
      },
    },
  });
}

export function createAuthRouteSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set({ name, value, ...options });
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });
}

export async function refreshAuthSession(request: NextRequest) {
  const config = getSupabaseConfig();
  let response = NextResponse.next({ request });
  if (!config) return response;

  const supabase = createServerClient<Database>(
    config.url,
    config.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value });
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}
