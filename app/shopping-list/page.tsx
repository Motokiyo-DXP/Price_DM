import { redirect } from "next/navigation";
import { ShoppingListLive } from "@/components/shopping-list-live";
import { ShoppingListSharing } from "@/components/shopping-list-sharing";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";
export default async function ShoppingListPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/shopping-list");
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") redirect("/login?next=/shopping-list");
  return <><ShoppingListSharing /><ShoppingListLive /></>;
}
