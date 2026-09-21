"use client";

import { useEffect, useMemo, useState } from "react";

type Card = { quantity: number; cost?: number | null; civilizations?: string[] };
const CIVILIZATIONS = [
  { key: "fire", label: "火", color: "#d84b5f" }, { key: "water", label: "水", color: "#59a9e9" },
  { key: "light", label: "光", color: "#ecc100" }, { key: "darkness", label: "闇", color: "#797a83" },
  { key: "nature", label: "自然", color: "#75a96c" }, { key: "zero", label: "ゼロ", color: "#b2b6bc" },
] as const;

function analyzeDeck(cards: Card[]) {
  const civilizations = Object.fromEntries(CIVILIZATIONS.map(({ key }) => [key, { single: 0, multi: 0 }])) as Record<(typeof CIVILIZATIONS)[number]["key"], { single: number; multi: number }>;
  const costs = Array<number>(10).fill(0);
  let total = 0; let single = 0; let multi = 0; let unknownCivilization = 0; let unknownCost = 0;
  for (const card of cards) {
    const quantity = Number.isSafeInteger(card.quantity) && card.quantity > 0 ? card.quantity : 0;
    total += quantity;
    const names = [...new Set((card.civilizations ?? []).map((name) => name.trim().toLowerCase()))].filter((name): name is (typeof CIVILIZATIONS)[number]["key"] => name in civilizations);
    if (names.length === 0) unknownCivilization += quantity;
    else { const kind = names.length > 1 ? "multi" : "single"; if (kind === "multi") multi += quantity; else single += quantity; for (const name of names) civilizations[name][kind] += quantity; }
    if (typeof card.cost === "number" && Number.isSafeInteger(card.cost) && card.cost >= 0) costs[Math.min(card.cost, 9)] += quantity;
    else unknownCost += quantity;
  }
  return { total, single, multi, unknownCivilization, unknownCost, civilizations, costs };
}

function AnalysisDashboard({ cards }: { cards: Card[] }) {
  const [helpOpen, setHelpOpen] = useState<"civilization" | "multicolor" | "mana" | null>(null);
  const analysis = useMemo(() => analyzeDeck(cards), [cards]);
  const manaMaximum = Math.max(1, ...analysis.costs);
  const singlePercent = analysis.total ? Math.round(analysis.single / analysis.total * 100) : 0;
  const multiPercent = analysis.total ? Math.round(analysis.multi / analysis.total * 100) : 0;
  const help = helpOpen === "civilization" ? "文明ごとの採用枚数です。濃い部分は単色、淡い部分は多色カードを示します。" : helpOpen === "multicolor" ? "デッキに入っている単色カードと多色カードの枚数・割合です。" : "カードのコストごとの枚数です。ツインパクトは上面のコストで集計します。";
  return <div className="deck-analysis-dashboard">
    <section className="deck-analysis-panel deck-analysis-civilization-panel">
      <h2>文明比較 <button aria-expanded={helpOpen === "civilization"} aria-label="文明比較の説明を表示" className="deck-analysis-help-button" onClick={() => setHelpOpen((current) => current === "civilization" ? null : "civilization")} type="button">?</button></h2>
      <div aria-label="文明別の単色・多色枚数グラフ" className="deck-civilization-chart" role="img"><div className="deck-chart-y-axis">{[40, 30, 20, 10, 0].map((value) => <span key={value}>{value}</span>)}</div><div className="deck-civilization-bars">{CIVILIZATIONS.map(({ key, color }) => { const { single, multi } = analysis.civilizations[key]; return <div className="deck-civilization-bar-column" key={key}><div className="deck-civilization-bar-track"><div className="deck-civilization-bar" style={{ height: `${Math.min(100, (single + multi) / 40 * 100)}%` }}><i style={{ backgroundColor: color, flex: single }} /><i style={{ backgroundColor: color, flex: multi, opacity: .58 }} /></div></div></div>; })}</div></div>
      <div className="deck-civilization-table" role="table"><div role="row"><strong role="columnheader"> </strong>{CIVILIZATIONS.map(({ key, label }) => <strong key={key} role="columnheader">{label}</strong>)}</div>{(["合計", "単色", "多色"] as const).map((row) => <div key={row} role="row"><strong role="rowheader">{row}</strong>{CIVILIZATIONS.map(({ key }) => <span key={key} role="cell">{row === "合計" ? analysis.civilizations[key].single + analysis.civilizations[key].multi : analysis.civilizations[key][row === "単色" ? "single" : "multi"]}</span>)}</div>)}</div>
    </section>
    <section className="deck-analysis-panel deck-analysis-multicolor-panel"><h2>多色割合 <button aria-expanded={helpOpen === "multicolor"} aria-label="多色割合の説明を表示" className="deck-analysis-help-button" onClick={() => setHelpOpen((current) => current === "multicolor" ? null : "multicolor")} type="button">?</button></h2><div className="deck-multicolor-content"><div><strong>合計 {analysis.total}枚</strong><span><i className="single" style={{ backgroundColor: "#2c313a" }} />単色 {analysis.single}枚 ({singlePercent}%)</span><span><i className="multi" style={{ backgroundColor: "#bfc4cb" }} />多色 {analysis.multi}枚 ({multiPercent}%)</span>{analysis.unknownCivilization ? <small>文明未登録 {analysis.unknownCivilization}枚</small> : null}</div><div aria-label={`単色 ${analysis.single}枚、多色 ${analysis.multi}枚`} className="deck-analysis-pie" role="img" style={{ background: analysis.total ? `conic-gradient(#2c313a 0 ${singlePercent}%, #bfc4cb ${singlePercent}% ${singlePercent + multiPercent}%, #727c98 ${singlePercent + multiPercent}% 100%)` : "#495473" }} /></div></section>
    <section className="deck-analysis-panel deck-analysis-mana-panel"><h2>マナカーブ <button aria-expanded={helpOpen === "mana"} aria-label="マナカーブの説明を表示" className="deck-analysis-help-button" onClick={() => setHelpOpen((current) => current === "mana" ? null : "mana")} type="button">?</button></h2><div aria-label="コスト別枚数グラフ" className="deck-mana-chart" role="img">{analysis.costs.map((count, index) => <div key={index}><div><i style={{ height: `${count / manaMaximum * 100}%` }} /></div><span>{index === 9 ? "9+" : index}</span></div>)}</div>{analysis.unknownCost ? <small className="deck-analysis-note">コスト未登録 {analysis.unknownCost}枚は含めていません。</small> : null}</section>
    {helpOpen ? <div className="deck-analysis-help-backdrop" onClick={() => setHelpOpen(null)} role="presentation"><section aria-label="分析項目の説明" className="deck-analysis-help-popover" onClick={(event) => event.stopPropagation()} role="dialog"><p>{help}</p><button onClick={() => setHelpOpen(null)} type="button">閉じる</button></section></div> : null}
  </div>;
}

function DeckAnalysisModal({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  useEffect(() => { const previous = document.body.style.overflow; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.body.style.overflow = "hidden"; document.addEventListener("keydown", onKeyDown); return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKeyDown); }; }, [onClose]);
  return <div className="deck-analysis-backdrop" onClick={onClose} role="presentation"><section aria-label="デッキ分析" aria-modal="true" className="deck-analysis-modal" onClick={(event) => event.stopPropagation()} role="dialog"><header><h1>デッキ分析</h1><button aria-label="デッキ分析を閉じる" onClick={onClose} type="button">×</button></header><AnalysisDashboard cards={cards} /></section></div>;
}

export function DeckAnalysis({ cards, inline = false, onClose }: { cards: Card[]; inline?: boolean; onClose?: () => void }) {
  if (inline) return <section aria-label="デッキ分析" className="deck-analysis-inline"><AnalysisDashboard cards={cards} /></section>;
  return onClose ? <DeckAnalysisModal cards={cards} onClose={onClose} /> : null;
}
