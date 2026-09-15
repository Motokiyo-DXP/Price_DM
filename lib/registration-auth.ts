import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export async function hasRegistrationUser() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getClaims();
  return !error && typeof data?.claims?.sub === "string";
}
