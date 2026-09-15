import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OnlineLobbyLive } from "@/components/online-lobby-live";
import { OnlineLobbyDeckPicker } from "@/components/online-lobby-deck-picker";
import { OnlineFriendInvite } from "@/components/online-friend-invite";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { setOnlineLobbyPassphraseAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function OnlineLobbyPage({ params, searchParams }: { params: Promise<{ lobbyId: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ lobbyId }, messages] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(lobbyId)) notFound();
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(`/rooms/lobbies/${lobbyId}`)}`);
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect(`/login?next=${encodeURIComponent(`/rooms/lobbies/${lobbyId}`)}`);

  const [{ data: lobby, error }, { data: slots }, { data: members }, { data: decks }, { data: currentMember }, { data: friends }] = await Promise.all([
    supabase.from("online_lobbies").select("id, kind, owner_user_id, join_code").eq("id", lobbyId).maybeSingle(),
    supabase.rpc("list_online_match_slots", { p_lobby_id: lobbyId }),
    supabase.rpc("list_online_lobby_members", { p_lobby_id: lobbyId }),
    supabase.from("decks").select("id, name, format, icon_canonical_card_id, deck_cards(canonical_card_id, card_print_id, quantity, zone)").eq("owner_id", userId).order("updated_at", { ascending: false }),
    supabase.from("online_lobby_members").select("selected_deck_id").eq("lobby_id", lobbyId).eq("user_id", userId).maybeSingle(),
    supabase.rpc("list_invitable_lobby_friends", { p_lobby_id: lobbyId }),
  ]);
  if (error || !lobby || !slots) notFound();
  const roomIds = slots.map((slot) => slot.game_room_id).filter((id): id is string => Boolean(id));
  const { data: myMatches } = roomIds.length ? await supabase.from("game_rooms").select("id").in("id", roomIds).eq("status", "playing").or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`) : { data: [] };
  const validDecks = (decks ?? []).filter((deck) => deck.deck_cards.filter((card) => card.zone === "main").reduce((sum, card) => sum + card.quantity, 0) === 40);
  const iconIds = [...new Set(validDecks.map((deck) => deck.icon_canonical_card_id ?? deck.deck_cards.find((card) => card.zone === "main")?.canonical_card_id).filter((id): id is number => typeof id === "number"))];
  const { data: iconPrints } = iconIds.length ? await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id", iconIds).not("image_key", "is", null).order("id") : { data: [] };
  const imageKeys = new Map<number, string>();
  const printImages = new Map<number, string>();
  for (const print of sortCardPrintsOldestFirst(iconPrints ?? [])) if (print.image_key) {
    if (!imageKeys.has(print.canonical_card_id)) imageKeys.set(print.canonical_card_id, print.image_key);
    printImages.set(print.id, print.image_key);
  }
  const playableDecks = validDecks.map((deck) => {
    const iconId = deck.icon_canonical_card_id ?? deck.deck_cards.find((card) => card.zone === "main")?.canonical_card_id;
    const iconCard = deck.deck_cards.find((card) => card.zone === "main" && card.canonical_card_id === iconId);
    const imageKey = (iconCard?.card_print_id ? printImages.get(iconCard.card_print_id) : null) ?? (iconId ? imageKeys.get(iconId) : null);
    return { id: deck.id, name: deck.name, format: deck.format, imageUrl: getCardImageUrl(imageKey) };
  });
  const isPublic = lobby.kind === "public";
  const memberCount = members?.length ?? 0;

  return <section className="online-lobby-page">
    <header className="online-lobby-header"><Link aria-label="オンライン対戦メニューへ戻る" href="/rooms">‹</Link><div><p>{isPublic ? "PUBLIC ROOM" : "PRIVATE ROOM"}</p><h1>{isPublic ? "公開ルーム" : "作成したルーム"}</h1></div>{isPublic ? <span className="online-lobby-member-count"><span aria-hidden="true" className="ui-icon ui-icon-team" />{memberCount}人</span> : null}</header>
    {messages.error ? <p className="notice error">{messages.error}</p> : null}{messages.notice ? <p className="notice success">{messages.notice}</p> : null}
    {!isPublic ? <section className="private-lobby-summary"><div><small>ルームID</small><strong>{lobby.join_code}</strong><span>参加者へ共有してください</span></div><div><small>メンバー</small><strong><span aria-hidden="true" className="ui-icon ui-icon-team" />{memberCount}人</strong><span>現在の参加人数</span></div></section> : null}
    <section className="online-lobby-controls">
      <p className="online-lobby-control-label">使用デッキ</p>
      <OnlineLobbyDeckPicker decks={playableDecks} lobbyId={lobby.id} selectedDeckId={currentMember?.selected_deck_id ?? null} />
      <div className={`online-lobby-secondary-controls ${isPublic ? "public" : ""}`}>
        <OnlineFriendInvite friends={friends ?? []} lobbyId={lobby.id} />
        {!isPublic ? <form action={setOnlineLobbyPassphraseAction} className="online-lobby-passphrase-control"><input name="lobbyId" type="hidden" value={lobby.id} /><label><span>合言葉を入力</span><input aria-label="合言葉" autoComplete="off" maxLength={32} minLength={4} name="passphrase" placeholder="英数字など" required type="text" /></label><button type="submit">OK</button></form> : null}
      </div>
    </section>
    <OnlineLobbyLive currentUserId={userId} decks={playableDecks} initialMembers={members ?? []} initialSlots={slots} initialMyMatchIds={(myMatches ?? []).map((room) => room.id)} isPublic={isPublic} lobbyId={lobby.id} selectedDeckId={currentMember?.selected_deck_id ?? null} />
  </section>;
}
