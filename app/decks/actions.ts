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
  const requestedPrints = input.cards.filter((card) => card.cardPrintId !== null);
  if (requestedPrints.length) {
    const { data: prints, error } = await supabase.from("card_prints").select("id, canonical_card_id").in("id", requestedPrints.map((card) => card.cardPrintId!));
    if (error || requestedPrints.some((card) => !prints?.some((print) => print.id === card.cardPrintId && print.canonical_card_id === card.canonicalCardId))) return { status: "error", message: "選択したイラストを確認できませんでした。" };
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
        card_print_id: card.cardPrintId,
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

export async function updateDeckAction(
  deckId: string,
  _previousState: DeckActionState,
  formData: FormData,
): Promise<DeckActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) return { status: "error", message: "デッキを確認できませんでした。" };
  const input = parseDeckInput(formData);
  if (!input) return { status: "error", message: "デッキの入力内容を確認してください。" };
  const auth = await authenticatedClient();
  if (!auth) return { status: "error", message: "ログインし直してください。" };
  const { data: ownedDeck } = await auth.supabase.from("decks").select("id, icon_canonical_card_id").eq("id", deckId).eq("owner_id", auth.userId).maybeSingle();
  if (!ownedDeck) return { status: "error", message: "このデッキを編集できません。" };
  const cardIds = input.cards.map((card) => card.canonicalCardId);
  if (cardIds.length) {
    const { data: cards, error } = await auth.supabase.from("canonical_cards").select("id").in("id", cardIds).is("deleted_at", null);
    if (error || cards?.length !== cardIds.length) return { status: "error", message: "利用できないカードが含まれています。" };
  }
  const requestedPrints = input.cards.filter((card) => card.cardPrintId !== null);
  if (requestedPrints.length) {
    const { data: prints, error } = await auth.supabase.from("card_prints").select("id, canonical_card_id").in("id", requestedPrints.map((card) => card.cardPrintId!));
    if (error || requestedPrints.some((card) => !prints?.some((print) => print.id === card.cardPrintId && print.canonical_card_id === card.canonicalCardId))) return { status: "error", message: "選択したイラストを確認できませんでした。" };
  }
  const keptIds = new Set(input.cards.map((card) => card.canonicalCardId));
  const { error: deckError } = await auth.supabase.from("decks").update({ name: input.name, format: input.format, visibility: input.visibility, description: input.description, icon_canonical_card_id: ownedDeck.icon_canonical_card_id && keptIds.has(ownedDeck.icon_canonical_card_id) ? ownedDeck.icon_canonical_card_id : null, updated_at: new Date().toISOString() }).eq("id", deckId).eq("owner_id", auth.userId);
  if (deckError) return { status: "error", message: "デッキ情報を更新できませんでした。" };
  const { error: deleteError } = await auth.supabase.from("deck_cards").delete().eq("deck_id", deckId);
  if (deleteError) return { status: "error", message: "カード内容を更新できませんでした。" };
  if (input.cards.length) {
    const { error: cardsError } = await auth.supabase.from("deck_cards").insert(input.cards.map((card, index) => ({ deck_id: deckId, canonical_card_id: card.canonicalCardId, card_print_id: card.cardPrintId, quantity: card.quantity, sort_order: index, zone: "main" })));
    if (cardsError) return { status: "error", message: "カード内容を保存できませんでした。" };
  }
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}/edit`);
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

async function authenticatedClient() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return error || typeof userId !== "string" ? null : { supabase, userId };
}

export async function createDeckFolderAction(formData: FormData) {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) return;
  const auth = await authenticatedClient(); if (!auth) return;
  await auth.supabase.from("deck_folders").insert({ owner_id: auth.userId, name: name.trim() }); revalidatePath("/decks");
}

export async function createFolderAndAssignDeckAction(formData: FormData) {
  const name = formData.get("name");
  const deckId = formData.get("deckId");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) return;
  if (typeof deckId !== "string" || !/^[0-9a-f-]{36}$/i.test(deckId)) return;
  const auth = await authenticatedClient(); if (!auth) return;
  const { data: folder, error } = await auth.supabase.from("deck_folders").insert({ owner_id: auth.userId, name: name.trim() }).select("id").single();
  if (error || !folder) return;
  await auth.supabase.from("decks").update({ folder_id: folder.id, updated_at: new Date().toISOString() }).eq("id", deckId).eq("owner_id", auth.userId);
  revalidatePath("/decks");
}

export async function assignDeckFolderAction(formData: FormData) {
  const deckId=formData.get("deckId"), folderId=formData.get("folderId");
  if(typeof deckId!=="string"||!/^[0-9a-f-]{36}$/i.test(deckId)||typeof folderId!=="string"||(folderId&&!/^[0-9a-f-]{36}$/i.test(folderId))) return;
  const auth=await authenticatedClient(); if(!auth)return;
  await auth.supabase.from("decks").update({folder_id:folderId||null,updated_at:new Date().toISOString()}).eq("id",deckId).eq("owner_id",auth.userId); revalidatePath("/decks");
}

export async function toggleDeckVisibilityAction(formData: FormData) {
  const deckId=formData.get("deckId"), visibility=formData.get("visibility")==="public"?"public":"private";
  if(typeof deckId!=="string"||!/^[0-9a-f-]{36}$/i.test(deckId))return;
  const auth=await authenticatedClient(); if(!auth)return;
  await auth.supabase.from("decks").update({visibility,updated_at:new Date().toISOString()}).eq("id",deckId).eq("owner_id",auth.userId); revalidatePath("/decks");
}

export async function setDeckIconAction(formData: FormData) {
  const deckId = formData.get("deckId");
  const canonicalCardId = Number(formData.get("canonicalCardId"));
  if (typeof deckId !== "string" || !/^[0-9a-f-]{36}$/i.test(deckId) || !Number.isSafeInteger(canonicalCardId) || canonicalCardId < 1) return;
  const auth = await authenticatedClient(); if (!auth) return;
  const { data: ownedDeck } = await auth.supabase.from("decks").select("id").eq("id", deckId).eq("owner_id", auth.userId).maybeSingle();
  if (!ownedDeck) return;
  const { data: included } = await auth.supabase.from("deck_cards").select("id").eq("deck_id", deckId).eq("canonical_card_id", canonicalCardId).limit(1).maybeSingle();
  if (!included) return;
  await auth.supabase.from("decks").update({ icon_canonical_card_id: canonicalCardId, updated_at: new Date().toISOString() }).eq("id", deckId).eq("owner_id", auth.userId);
  revalidatePath("/decks");
}

export async function copyDeckAction(formData: FormData) {
  const deckId=formData.get("deckId"); if(typeof deckId!=="string"||!/^[0-9a-f-]{36}$/i.test(deckId))return;
  const auth=await authenticatedClient(); if(!auth)return;
  const {data:source}=await auth.supabase.from("decks").select("name, format, description, folder_id, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, zone, quantity, sort_order)").eq("id",deckId).eq("owner_id",auth.userId).single(); if(!source)return;
  const {data:copy}=await auth.supabase.from("decks").insert({owner_id:auth.userId,name:`${source.name} のコピー`,format:source.format,description:source.description,folder_id:source.folder_id,icon_canonical_card_id:source.icon_canonical_card_id,visibility:"private"}).select("id").single();
  if(!copy)return;
  if(source.deck_cards.length){
    const {error}=await auth.supabase.from("deck_cards").insert(source.deck_cards.map((card)=>({...card,deck_id:copy.id})));
    if(error){await auth.supabase.from("decks").delete().eq("id",copy.id).eq("owner_id",auth.userId);return;}
  }
  revalidatePath("/decks");
  redirect(`/decks/${copy.id}/edit`);
}

export async function signOutAction() {
  const supabase = await createAuthServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
