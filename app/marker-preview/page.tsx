"use client";

import { useState } from "react";
import styles from "./page.module.css";

const mainMarkers = ["アタック禁止", "ブロック禁止", "アンタップしない", "除去耐性", "能力無効", "メタ注意", "ハイパーモード"] as const;
const otherMarkers = ["ブロッカー", "パワーアップ", "スピアタ", "マッハファイター", "スレイヤー"] as const;

export default function MarkerPreviewPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [slayerCount, setSlayerCount] = useState(0);
  const [othersOpen, setOthersOpen] = useState(false);

  function renderMarker(name: string) {
    const isSlayer = name === "スレイヤー";
    return (
      <div className={styles.row} key={name}>
        <img alt="" className={styles.icon} height={48} src={`/markers/preview/${name}.svg`} width={48} />
        <span className={styles.label}>{name}</span>
        {isSlayer ? (
          <div aria-label="スレイヤーの数" className={styles.counter}>
            <button aria-label="スレイヤーを減らす" disabled={slayerCount === 0} onClick={() => setSlayerCount((count) => Math.max(0, count - 1))} type="button">−</button>
            <output aria-live="polite">{slayerCount}</output>
            <button aria-label="スレイヤーを増やす" onClick={() => setSlayerCount((count) => count + 1)} type="button">＋</button>
          </div>
        ) : (
          <button
            aria-checked={Boolean(enabled[name])}
            aria-label={`${name}を${enabled[name] ? "オフ" : "オン"}にする`}
            className={`${styles.switch} ${enabled[name] ? styles.on : ""}`}
            onClick={() => setEnabled((current) => ({ ...current, [name]: !current[name] }))}
            role="switch"
            type="button"
          ><span /></button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <section aria-label="マーキングのデザインプレビュー" className={styles.modal}>
        <header className={styles.header}><h1>マーキング</h1><span aria-hidden="true">×</span></header>
        <div className={styles.card}><div aria-hidden="true" className={styles.cardArt}>DM</div><div><strong>カード名</strong><small>マーカー操作のプレビュー</small></div></div>
        <div className={styles.rows}>{mainMarkers.map(renderMarker)}</div>
        <button aria-expanded={othersOpen} className={styles.disclosure} onClick={() => setOthersOpen((open) => !open)} type="button"><span>その他</span><span aria-hidden="true">{othersOpen ? "▲" : "▼"}</span></button>
        {othersOpen ? <div className={styles.rows}>{otherMarkers.map(renderMarker)}</div> : null}
      </section>
    </div>
  );
}
