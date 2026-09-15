"use client";

import { useEffect, useMemo, useState } from "react";

type Card = { quantity: number; cost?: number | null; civilizations?: string[] };
const CIVILIZATIONS = [
  { key: "fire", label: "火", color: "#d84b5f" },
  { key: "water", label: "水", color: "#59a9e9" },
  { key: "light", label: "光", color: "#d9b900" },
  { key: "darkness", label: "闇", color: "#797a83" },
  { key: "nature", label: "自然", color: "#5b9a63" },
  { key: "zero", label: "ゼロ", color: "#b2b6bc" },
] as const;

function analyzeDeck(cards: Card[]) {
  const civilizations = Object.fromEntries(CIVILIZATIONS.map(({ key }) => [key, { single: 0, multi: 0 }])) as Record<(typeof CIVILIZATIONS)[number]["key"], { single: number; multi: number }>;
  const costs = Array<number>(10).fill(0);
  let total = 0;
  let single = 0;
  let multi = 0;
  let unknownCivilization = 0;
  let unknownCost = 0;
  for (const card of cards) {
    const quantity = Number.isSafeInteger(card.quantity) && card.quantity > 0 ? card.quantity : 0;
    total += quantity;
    const names = [...new Set((card.civilizations ?? []).map((name) => name.trim().toLowerCase()))].filter((name): name is (typeof CIVILIZATIONS)[number]["key"] => name in civilizations);
    if (names.length === 0) unknownCivilization += quantity;
    else {
      const kind = names.length > 1 ? "multi" : "single";
      if (kind === "multi") multi += quantity;
      else single += quantity;
      for (const name of names) civilizations[name][kind] += quantity;
    }
    // canonical_cards.cost stores the upper face of a twin-pact card.
    if (typeof card.cost === "number" && Number.isSafeInteger(card.cost) && card.cost >= 0) costs[Math.min(card.cost, 9)] += quantity;
    else unknownCost += quantity;
  }
  return { total, single, multi, unknownCivilization, unknownCost, civilizations, costs };
}

export function DeckAnalysis({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const [tab, setTab] = useState<"civilization" | "mana">("civilization");
  const analysis = useMemo(() => analyzeDeck(cards), [cards]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);
  const values = tab === "civilization" ? CIVILIZATIONS.map(({ key }) => analysis.civilizations[key].single + analysis.civilizations[key].multi) : analysis.costs;
  const maximum = Math.max(1, ...values);
  return <div className="deck-analysis-backdrop" onClick={onClose} role="presentation">
    <section aria-label="デッキ分析" aria-modal="true" className="deck-analysis-modal" onClick={(event) => event.stopPropagation()} role="dialog">
      <header><h2>デッキ分析</h2><button aria-label="デッキ分析を閉じる" onClick={onClose} type="button">×</button></header>
      <h3>デッキ枚数</h3>
      <div className="deck-analysis-summary"><div><strong>合計 {analysis.total}枚</strong><span>● 単色 {analysis.single}枚</span><span>◌ 多色 {analysis.multi}枚</span>{analysis.unknownCivilization > 0 ? <small>文明未登録 {analysis.unknownCivilization}枚</small> : null}</div>
        <div aria-label={`単色 ${analysis.single}枚、多色 ${analysis.multi}枚${analysis.unknownCivilization ? `、文明未登録 ${analysis.unknownCivilization}枚` : ""}`} className="deck-analysis-pie" role="img" style={{ background: analysis.total ? `conic-gradient(#ecc100 0 ${analysis.single / analysis.total * 100}%, #69a2ff ${analysis.single / analysis.total * 100}% ${(analysis.single + analysis.multi) / analysis.total * 100}%, #727c98 ${(analysis.single + analysis.multi) / analysis.total * 100}% 100%)` : "#495473" }} /></div>
      <div aria-label="分析項目" className="deck-analysis-tabs" role="tablist"><button aria-selected={tab === "civilization"} onClick={() => setTab("civilization")} role="tab" type="button">文明</button><button aria-selected={tab === "mana"} onClick={() => setTab("mana")} role="tab" type="button">マナ</button></div>
      <div className="deck-analysis-chart" role="img" aria-label={tab === "civilization" ? "文明別の単色・多色枚数グラフ" : "コスト別枚数グラフ"}>
        {(tab === "civilization" ? CIVILIZATIONS.map(({ key, label, color }) => ({ label, color, single: analysis.civilizations[key].single, multi: analysis.civilizations[key].multi })) : analysis.costs.map((count, index) => ({ label: index === 9 ? "9～" : String(index), color: "#ecc100", single: count, multi: 0 }))).map(({ label, color, single, multi }) => <div className="deck-analysis-column" key={label}><div className="deck-analysis-column-track"><div className="deck-analysis-bar" style={{ height: `${(single + multi) / maximum * 100}%` }}><span style={{ background: color, flex: single }} /><span style={{ background: color, flex: multi, opacity: .55 }} /></div></div><span>{label}</span></div>)}
      </div>
      <div className="deck-analysis-table-scroll"><table><tbody>{tab === "civilization" ? <><tr><th scope="row">文明</th>{CIVILIZATIONS.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}</tr>{(["合計", "多色", "単色"] as const).map((row) => <tr key={row}><th scope="row">{row}</th>{CIVILIZATIONS.map(({ key }) => <td key={key}>{row === "合計" ? analysis.civilizations[key].single + analysis.civilizations[key].multi : analysis.civilizations[key][row === "多色" ? "multi" : "single"]}</td>)}</tr>)}</> : <><tr><th scope="row">コスト</th>{analysis.costs.map((_, index) => <th key={index} scope="col">{index === 9 ? "9～" : index}</th>)}</tr><tr><th scope="row">合計</th>{analysis.costs.map((count, index) => <td key={index}>{count}</td>)}</tr></>}</tbody></table></div>
      {tab === "mana" ? <><p className="deck-analysis-note">※ツインパクトカードは上面のコストのみを参照しています。</p>{analysis.unknownCost > 0 ? <p className="deck-analysis-note">コスト未登録 {analysis.unknownCost}枚は集計表に含めていません。</p> : null}</> : null}
    </section>
  </div>;
}
