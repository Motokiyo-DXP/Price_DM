"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CardArtwork } from "@/components/card-artwork";

export type SoloDeckOption = {
  id: string;
  name: string;
  formatName: string;
  count: number;
  imageUrl: string | null;
  start: string;
  end: string;
};

export function SoloDeckPicker({ decks }: { decks: SoloDeckOption[] }) {
  const router = useRouter();
  const [playerDeckId, setPlayerDeckId] = useState<string | null>(null);
  const [opponentDeckId, setOpponentDeckId] = useState<string | null>(null);

  useEffect(() => {
    if (playerDeckId && opponentDeckId) {
      const frame = window.requestAnimationFrame(() => {
        router.push(`/playtest/${playerDeckId}?opponent=${opponentDeckId}`);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [opponentDeckId, playerDeckId, router]);

  function selectDeck(deckId: string) {
    if (!playerDeckId) {
      setPlayerDeckId(deckId);
      return;
    }
    if (!opponentDeckId) setOpponentDeckId(deckId);
  }

  return <>
    <div className="solo-section-heading">
      <h2>{playerDeckId ? "相手側のデッキを選ぶ" : "使うデッキを選ぶ"}</h2>
      <span>更新順</span>
    </div>
    <div className="solo-deck-list">{decks.map((deck, index) => {
      const isPlayerDeck = playerDeckId === deck.id;
      const isOpponentDeck = opponentDeckId === deck.id;
      const selection = isPlayerDeck && isOpponentDeck ? "both" : isPlayerDeck ? "player" : isOpponentDeck ? "opponent" : undefined;
      const style = { "--solo-start": deck.start, "--solo-end": deck.end } as CSSProperties;
      return <button
        aria-label={`${deck.name}を${playerDeckId ? "相手側" : "使用する側"}のデッキに選ぶ`}
        aria-pressed={isPlayerDeck || isOpponentDeck}
        data-selection={selection}
        key={`${deck.id}-${index}`}
        onClick={() => selectDeck(deck.id)}
        style={style}
        type="button"
      >
        {deck.imageUrl ? <CardArtwork className="solo-deck-artwork" eager={index < 5} imageUrl={deck.imageUrl} name={deck.name} sizes="(max-width: 560px) 50vw, 196px" /> : <span className="solo-deck-mark" aria-hidden="true">{deck.name.trim().charAt(0).toUpperCase() || "D"}</span>}
        <span className="solo-deck-shine" aria-hidden="true" />
        <span className="solo-deck-meta"><strong>{deck.name}</strong><small>{deck.formatName}・{deck.count}枚</small></span>
        <b aria-hidden="true">→</b>
      </button>;
    })}</div>
  </>;
}
