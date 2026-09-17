"use client";

import { useState } from "react";

export function OnlineLobbyCodeCopyButton({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  async function copyJoinCode() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return <button aria-label="ルームIDをコピー" className="private-lobby-code-copy" onClick={() => void copyJoinCode()} type="button">{copied ? "コピーしました" : "⧉"}</button>;
}
