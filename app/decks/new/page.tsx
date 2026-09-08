import { redirect } from "next/navigation";
import { DeckEditor } from "@/components/deck-editor";
import { loadLocalCardMetadata } from "@/lib/local-card-metadata";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function NewDeckPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") redirect("/login");
  const localMetadata = await loadLocalCardMetadata();
  const fallbackCosts = Object.fromEntries([...localMetadata].flatMap(([name, metadata]) => metadata.cost === null ? [] : [[name, metadata.cost]]));
  return <section className="deck-editor-page"><DeckEditor fallbackCosts={fallbackCosts} /></section>;
}
