"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RoomWaitingRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <span className="room-auto-refresh">参加状況を自動確認しています</span>;
}
