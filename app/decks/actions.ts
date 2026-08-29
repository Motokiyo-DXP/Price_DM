"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDeckInput } from "@/lib/deck-validation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import type { DeckActionState } from "./action-state";

export async function createDeckAction(
  _previousState: DeckActionState,
  formData: FormData,
): Promise<DeckActionState> {
  const input = parseDeckInput(formData);
  if (!input) return { status: "error", message: "デッキの入力内容を確認してください。" };

  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return { status: "error", message: "接続設定を確認してください。" };
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { status: "error", message: "ログインし直してください。" };
  }

  const cardIds = input.cards.map((card) => card.canonicalCardId);
  if (cardIds.length > 0) {
    const { data: cards, error: cardsError } = await supabase
      .from("canonical_cards")
      .select("id")
      .in("id", cardIds)
      .is("deleted_at", null);
    if (cardsError || cards?.length !== cardIds.length) {
      return { status: "error", message: "利用できないカードが含まれています。" };
    }
  }

  const { data: deck, error: deckError } = await supabase
    .from("decks")
    .insert({
      owner_id: userId,
      name: input.name,
      format: input.format,
      visibility: input.visibility,
      description: input.description,
    })
    .select("id")
    .single();
  if (deckError || !deck) return { status: "error", message: "デッキを保存できませんでした。" };

  if (input.cards.length > 0) {
    const { error: itemsError } = await supabase.from("deck_cards").insert(
      input.cards.map((card, index) => ({
        deck_id: deck.id,
        canonical_card_id: card.canonicalCardId,
        quantity: card.quantity,
        sort_order: index,
        zone: "main",
      })),
    );
    if (itemsError) {
      await supabase.from("decks").delete().eq("id", deck.id);
      return { status: "error", message: "カードを保存できませんでした。" };
    }
  }

  revalidatePath("/decks");
  redirect("/decks");
}

export async function deleteDeckAction(formData: FormData) {
  const id = formData.get("deckId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return;
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") return;
  await supabase.from("decks").delete().eq("id", id);
  revalidatePath("/decks");
}

export async function signOutAction() {
  const supabase = await createAuthServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
