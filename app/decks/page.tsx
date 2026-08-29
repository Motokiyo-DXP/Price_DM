import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { deleteDeckAction, signOutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/login");

  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, name, format, visibility, description, updated_at, deck_cards(quantity)")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  return (
    <section className="decks-page">
      <div className="decks-heading"><div><p className="eyebrow">マイデッキ</p><h1>保存したデッキ</h1></div><div><Link className="secondary-button" href="/rooms">オンライン対戦</Link><Link className="button" href="/decks/new">＋ 新規作成</Link><form action={signOutAction}><button className="secondary-button" type="submit">ログアウト</button></form></div></div>
      {error ? <p className="notice error">デッキを読み込めませんでした。</p> : null}
      {!error && decks?.length === 0 ? <div className="history-empty"><strong>デッキはまだありません</strong><p>最初のデッキを作成してカードを追加しましょう。</p></div> : null}
      <div className="deck-list">
        {(decks ?? []).map((deck) => {
          const count = deck.deck_cards.reduce((sum, card) => sum + card.quantity, 0);
          return <article key={deck.id}><div><span className="tag">{deck.format === "advanced" ? "アドバンス" : "オリジナル"}</span><h2>{deck.name}</h2><p>{deck.description || "説明はありません。"}</p></div><div className="deck-summary"><strong>{count} / 40</strong><small>{deck.visibility === "public" ? "公開" : deck.visibility === "unlisted" ? "URL限定" : "非公開"}</small><Link className="button compact" href={`/playtest/${deck.id}`}>一人回し</Link><form action={deleteDeckAction}><input name="deckId" type="hidden" value={deck.id} /><button className="secondary-button danger-button" type="submit">削除</button></form></div></article>;
        })}
      </div>
    </section>
  );
}
