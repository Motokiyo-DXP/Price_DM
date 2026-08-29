import Link from "next/link";
import { redirect } from "next/navigation";
import { DeckEditor } from "@/components/deck-editor";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function NewDeckPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") redirect("/login");
  return <section className="decks-page"><Link className="back-link" href="/decks">← マイデッキ</Link><p className="eyebrow">デッキビルダー</p><h1>新しいデッキ</h1><DeckEditor /></section>;
}
