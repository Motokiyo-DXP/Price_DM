export const DM_CANONICAL_EQUIVALENTS = new Map([
  ["dmart26-001", { name: "蒼き守護神 ドギラゴン閃", reading: "アオキシュゴジン ドギラゴンノヴァ" }],
  ["dmart26-002", { name: "∞龍 ゲンムエンペラー", reading: "ムゲンリュウ ゲンムエンペラー" }],
  ["dmart26-003", { name: "偽りの希望 鬼丸「終斗」", reading: "イツワリノキボウ オニマルピリオド" }],
  ["dmart26-004", { name: "紅き団長 ドギラゴン悪", reading: "アカキダンチョウ ドギラゴンヒート" }],
  ["dmart26-005", { name: "ボルシャック・ドリーム・ドラゴン", reading: "ボルシャック・ドリーム・ドラゴン" }],
  ["dmart26-006", { name: "終末縫合王 ザ=キラー・キーナリー", reading: "シュウマツホウゴウオウ ザ・キラー・キーナリー" }],
]);

export function canonicalizeDuelMastersCard(card, officialCardId) {
  const canonical = DM_CANONICAL_EQUIVALENTS.get(officialCardId?.toLowerCase());
  return canonical ? { ...card, name: canonical.name, name_kana: canonical.reading } : card;
}
