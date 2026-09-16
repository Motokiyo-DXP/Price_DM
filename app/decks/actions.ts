"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDeckInput } from "@/lib/deck-validation";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import type { DeckActionState } from "./action-state";
import { isUuid as isShareUuid, parseSharedDeck, type SharedDeck } from "@/lib/shared-deck";

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

export async function renameDeckAction(formData: FormData): Promise<DeckActionState> {
  const deckId = formData.get("deckId");
  const name = formData.get("name");
  if (typeof deckId !== "string" || !/^[0-9a-f-]{36}$/i.test(deckId)) {
    return { status: "error", message: "デッキを確認できませんでした。" };
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
    return { status: "error", message: "デッキ名は1〜60文字で入力してください。" };
  }
  const auth = await authenticatedClient();
  if (!auth) return { status: "error", message: "ログインし直してください。" };
  const { data, error } = await auth.supabase
    .from("decks")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", deckId)
    .eq("owner_id", auth.userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: "デッキ名を変更できませんでした。" };
  if (!data) return { status: "error", message: "このデッキを変更できません。" };
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}/edit`);
  return { status: "success", message: "デッキ名を変更しました。" };
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

const deckListSortModes = new Set(["user", "newest"]);

function isUuid(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function renameDeckFolderAction(
  _previousState: DeckActionState,
  formData: FormData,
): Promise<DeckActionState> {
  const folderId = formData.get("folderId");
  const name = formData.get("name");
  if (!isUuid(folderId)) return { status: "error", message: "フォルダを確認できませんでした。" };
  if (typeof name !== "string") return { status: "error", message: "フォルダ名を入力してください。" };
  const normalizedName = name.trim();
  if (normalizedName.length < 1 || normalizedName.length > 60) {
    return { status: "error", message: "フォルダ名は1〜60文字で入力してください。" };
  }
  const auth = await authenticatedClient();
  if (!auth) return { status: "error", message: "ログインし直してください。" };
  const { data, error } = await auth.supabase
    .from("deck_folders")
    .update({ name: normalizedName, updated_at: new Date().toISOString() })
    .eq("id", folderId)
    .eq("owner_id", auth.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "同じ名前のフォルダが既にあります。" : "フォルダ名を変更できませんでした。",
    };
  }
  if (!data) return { status: "error", message: "このフォルダを変更できません。" };
  revalidatePath("/decks");
  return { status: "success", message: "フォルダ名を変更しました。" };
}

export async function deleteDeckFolderAction(
  _previousState: DeckActionState,
  formData: FormData,
): Promise<DeckActionState> {
  const folderId = formData.get("folderId");
  if (!isUuid(folderId)) return { status: "error", message: "フォルダを確認できませんでした。" };
  const auth = await authenticatedClient();
  if (!auth) return { status: "error", message: "ログインし直してください。" };
  const { data, error } = await auth.supabase
    .from("deck_folders")
    .delete()
    .eq("id", folderId)
    .eq("owner_id", auth.userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: "フォルダを削除できませんでした。" };
  if (!data) return { status: "error", message: "このフォルダを削除できません。" };
  revalidatePath("/decks");
  return { status: "success", message: "フォルダを削除しました。デッキは未分類へ移動しました。" };
}

function parseOrderedIds(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try {
    const ids: unknown = JSON.parse(value);
    if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return null;
    return ids as string[];
  } catch {
    return null;
  }
}

export async function setDeckListSortAction(formData: FormData) {
  const mode = formData.get("mode");
  if (typeof mode !== "string" || !deckListSortModes.has(mode)) return { ok: false };
  const auth = await authenticatedClient(); if (!auth) return { ok: false };
  const { error } = await auth.supabase.from("profiles").update({ deck_list_sort_mode: mode, updated_at: new Date().toISOString() }).eq("user_id", auth.userId);
  revalidatePath("/decks");
  return { ok: !error };
}

export async function reorderDeckFoldersAction(formData: FormData) {
  const value = formData.get("orderedIds");
  let orderedIds: string[] | null = null;
  try {
    const ids: unknown = typeof value === "string" ? JSON.parse(value) : null;
    if (Array.isArray(ids) && ids.length <= 501 && ids.every((id) => typeof id === "string" && (id === "none" || /^[0-9a-f-]{36}$/i.test(id)))) orderedIds = ids;
  } catch {}
  if (!orderedIds || new Set(orderedIds).size !== orderedIds.length || orderedIds.filter((id) => id === "none").length !== 1) return { ok: false };
  const auth = await authenticatedClient(); if (!auth) return { ok: false };
  const { data: ownedFolders } = await auth.supabase.from("deck_folders").select("id").eq("owner_id", auth.userId);
  const ownedIds = (ownedFolders ?? []).map((folder) => folder.id);
  if (ownedIds.length + 1 !== orderedIds.length || ownedIds.some((id) => !orderedIds.includes(id))) return { ok: false };
  const results = await Promise.all(orderedIds.flatMap((id, index) => id === "none" ? [] : [auth.supabase.from("deck_folders").update({ user_sort_order: index }).eq("id", id).eq("owner_id", auth.userId)]));
  const { error: profileError } = await auth.supabase.from("profiles").update({ unfiled_folder_sort_order: orderedIds.indexOf("none"), updated_at: new Date().toISOString() }).eq("user_id", auth.userId);
  revalidatePath("/decks");
  return { ok: !profileError && results.every(({ error }) => !error) };
}

export async function reorderDecksAction(formData: FormData) {
  const orderedIds = parseOrderedIds(formData.get("orderedIds"));
  const rawFolderId = formData.get("folderId");
  if (!orderedIds || new Set(orderedIds).size !== orderedIds.length || typeof rawFolderId !== "string" || (rawFolderId && !/^[0-9a-f-]{36}$/i.test(rawFolderId))) return { ok: false };
  const auth = await authenticatedClient(); if (!auth) return { ok: false };
  let query = auth.supabase.from("decks").select("id").eq("owner_id", auth.userId);
  query = rawFolderId ? query.eq("folder_id", rawFolderId) : query.is("folder_id", null);
  const { data: ownedDecks } = await query;
  const ownedIds = (ownedDecks ?? []).map((deck) => deck.id);
  if (ownedIds.length !== orderedIds.length || ownedIds.some((id) => !orderedIds.includes(id))) return { ok: false };
  const results = await Promise.all(orderedIds.map((id, index) => auth.supabase.from("decks").update({ user_sort_order: index }).eq("id", id).eq("owner_id", auth.userId)));
  await auth.supabase.from("profiles").update({ deck_list_sort_mode: "user", updated_at: new Date().toISOString() }).eq("user_id", auth.userId);
  revalidatePath("/decks");
  return { ok: results.every(({ error }) => !error) };
}

export async function moveDeckToFolderAction(formData: FormData) {
  const deckId = formData.get("deckId"), folderId = formData.get("folderId");
  if (!isUuid(deckId) || typeof folderId !== "string" || (folderId !== "" && !isUuid(folderId))) return { ok: false };
  const auth = await authenticatedClient(); if (!auth) return { ok: false };
  if (folderId) {
    const { data: folder, error } = await auth.supabase.from("deck_folders").select("id").eq("id", folderId).eq("owner_id", auth.userId).maybeSingle();
    if (error || !folder) return { ok: false };
  }
  let orderQuery = auth.supabase.from("decks").select("user_sort_order").eq("owner_id", auth.userId);
  orderQuery = folderId ? orderQuery.eq("folder_id", folderId) : orderQuery.is("folder_id", null);
  const { data: lastDeck, error: orderError } = await orderQuery.order("user_sort_order", { ascending: false }).limit(1).maybeSingle();
  if (orderError) return { ok: false };
  const userSortOrder = (lastDeck?.user_sort_order ?? -1) + 1;
  const { data: moved, error } = await auth.supabase.from("decks").update({ folder_id: folderId || null, user_sort_order: userSortOrder, updated_at: new Date().toISOString() }).eq("id", deckId).eq("owner_id", auth.userId).select("id").maybeSingle();
  if (error || !moved) return { ok: false };
  revalidatePath("/decks");
  return { ok: true };
}

export async function toggleDeckVisibilityAction(formData: FormData) {
  const deckId=formData.get("deckId"), visibility=formData.get("visibility")==="public"?"public":"private";
  if(typeof deckId!=="string"||!/^[0-9a-f-]{36}$/i.test(deckId))return {ok:false};
  const auth=await authenticatedClient(); if(!auth)return {ok:false};
  const {data,error}=await auth.supabase.from("decks").update({visibility,updated_at:new Date().toISOString()}).eq("id",deckId).eq("owner_id",auth.userId).select("id").maybeSingle();
  if(error||!data)return {ok:false};
  revalidatePath("/decks");
  return {ok:true};
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

export async function importPublicDeckAction(formData: FormData) {
  const deckId = formData.get("deckId");
  const destination = formData.get("destination");
  if (typeof deckId !== "string" || !/^[0-9a-f-]{36}$/i.test(deckId)) return;
  if (destination !== "edit") return;

  const auth = await authenticatedClient();
  if (!auth) redirect(`/login?next=${encodeURIComponent("/deck-search")}`);

  const { data: source } = await auth.supabase
    .from("decks")
    .select("name, format, description, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, zone, quantity, sort_order)")
    .eq("id", deckId)
    .eq("visibility", "public")
    .single();
  if (!source) return;

  await importDeckCopy(auth, source, destination);
}

type ImportSource = Pick<SharedDeck, "name" | "format" | "description" | "icon_canonical_card_id"> & {
  deck_cards: Pick<SharedDeck["cards"][number], "canonical_card_id" | "card_print_id" | "zone" | "quantity" | "sort_order">[];
};

async function importDeckCopy(auth: NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>, source: ImportSource, destination: "edit" | "solo") {
  const { data: copy } = await auth.supabase
    .from("decks")
    .insert({
      owner_id: auth.userId,
      name: source.name,
      format: source.format,
      description: source.description,
      icon_canonical_card_id: source.icon_canonical_card_id,
      visibility: "private",
    })
    .select("id")
    .single();
  if (!copy) return;

  if (source.deck_cards.length) {
    const { error } = await auth.supabase.from("deck_cards").insert(
      source.deck_cards.map((card) => ({ ...card, deck_id: copy.id })),
    );
    if (error) {
      await auth.supabase.from("decks").delete().eq("id", copy.id).eq("owner_id", auth.userId);
      return;
    }
  }

  revalidatePath("/decks");
  revalidatePath("/solo");
  redirect(destination === "edit" ? `/decks/${copy.id}/edit` : `/playtest/${copy.id}/opponent`);
}

export async function getOrCreateDeckShareTokenAction(deckId: string): Promise<string | null> {
  if (!isShareUuid(deckId)) return null;
  const auth = await authenticatedClient();
  if (!auth) return null;
  const { data, error } = await auth.supabase.rpc("get_or_create_deck_share_token", { p_deck_id: deckId });
  return error || !isShareUuid(data) ? null : data;
}

export async function importSharedDeckAction(formData: FormData) {
  const token = formData.get("shareToken");
  const destination = formData.get("destination");
  if (!isShareUuid(token) || (destination !== "edit" && destination !== "solo")) return;
  const auth = await authenticatedClient();
  if (!auth) redirect(`/login?next=${encodeURIComponent(`/deck-search?share=${token}`)}`);
  const { data, error } = await auth.supabase.rpc("get_shared_deck", { p_share_token: token });
  const source = error ? null : parseSharedDeck(data);
  if (!source) return;
  await importDeckCopy(auth, { ...source, deck_cards: source.cards.map(({ canonical_card_id, card_print_id, zone, quantity, sort_order }) => ({ canonical_card_id, card_print_id, zone, quantity, sort_order })) }, destination);
}

export async function signOutAction() {
  const supabase = await createAuthServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
