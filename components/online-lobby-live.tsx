"use client";

import { useCallback, useEffect, useState } from "react";
import { OnlineLobbySlots } from "@/components/online-lobby-slots";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export type OnlineLobbySlot = {
  id: string; slot_number: number; format: string; time_limit_minutes: number;
  game_room_id: string | null; status: string; player_count: number; spectator_count: number;
  host_display_name: string | null; host_avatar_url: string | null;
  guest_display_name: string | null; guest_avatar_url: string | null;
};
export type OnlineLobbyMember = {
  user_id: string; display_name: string; avatar_url: string | null; member_role: string;
  last_seen_at: string; is_online: boolean;
};
type LobbyDeck = { id: string; name: string; format: string };

export function OnlineLobbyLive({
  currentUserId, decks, initialMembers, initialSlots, isPublic, lobbyId, selectedDeckId,
}: {
  currentUserId: string; decks: LobbyDeck[]; initialMembers: OnlineLobbyMember[];
  initialSlots: OnlineLobbySlot[]; isPublic: boolean; lobbyId: string; selectedDeckId?: string | null;
}) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [slots, setSlots] = useState(initialSlots);
  const [members, setMembers] = useState(initialMembers);
  const [connection, setConnection] = useState("接続中");

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [{ data: nextSlots }, { data: nextMembers }] = await Promise.all([
      supabase.rpc("list_online_match_slots", { p_lobby_id: lobbyId }),
      supabase.rpc("list_online_lobby_members", { p_lobby_id: lobbyId }),
    ]);
    if (nextSlots) setSlots(nextSlots);
    if (nextMembers) setMembers(nextMembers);
  }, [lobbyId, supabase]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const heartbeat = async () => {
      await supabase.rpc("touch_online_lobby_presence", { p_lobby_id: lobbyId });
      if (active) await refresh();
    };
    void heartbeat();
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 15_000);
    const fallbackTimer = window.setInterval(() => void refresh(), 10_000);
    const channel = supabase.channel(`lobby-live:${lobbyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "online_match_slots", filter: `lobby_id=eq.${lobbyId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "online_lobby_members", filter: `lobby_id=eq.${lobbyId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, () => void refresh())
      .subscribe((status) => setConnection(status === "SUBSCRIBED" ? "リアルタイム同期中" : status === "CHANNEL_ERROR" ? "再接続中" : "接続中"));
    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(fallbackTimer);
      void supabase.removeChannel(channel);
    };
  }, [lobbyId, refresh, supabase]);

  return <div className="online-lobby-layout">
    <main><div className="lobby-section-heading"><h2>マッチ受付</h2></div><OnlineLobbySlots decks={decks} lobbyId={lobbyId} preferredDeckId={selectedDeckId} slots={slots} /></main>
    <aside>
      <div className="lobby-members-title"><strong>ルームメンバー</strong><span className="lobby-sync-status">{connection}</span></div>
      {members.map((member) => <article key={member.user_id}><span className={`member-avatar ${member.avatar_url ? "has-image" : ""}`} style={member.avatar_url ? { backgroundImage: `url("${member.avatar_url}")` } : undefined}>{member.avatar_url ? null : member.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{member.display_name}{member.user_id === currentUserId ? "（あなた）" : ""}</strong><small>{member.member_role === "owner" ? "作成者・" : ""}{member.is_online ? "オンライン" : "離席中"}</small></div></article>)}
      <div className="lobby-information"><strong>{isPublic ? "誰でも参加できます" : "ルームIDまたは招待で参加できます"}</strong><p>受付ごとにフォーマット、時間制限、使用デッキ、対戦・観戦を選択できます。</p></div>
    </aside>
  </div>;
}
