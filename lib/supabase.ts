import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey || url.includes("YOUR_PROJECT")) {
    return null;
  }

  return { url, publishableKey };
}

export function createBrowserSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createBrowserClient<Database>(config.url, config.publishableKey);
}

export function createServerSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createSupabaseClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
