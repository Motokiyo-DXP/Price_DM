export const DM_CANONICAL_EQUIVALENTS = new Map([
  ["dmart10-001", { name: "“罰怒“ブランド", reading: "“バチイカ“ブランド" }],
  ["dmart10-002", { name: "我我我ガイアール・ブランド", reading: "ワガワガワガガイアール・ブランド" }],
  ["dmart10-003", { name: "切札勝太&カツキング ー熱血の物語ー", reading: "キリフダカツタ&カツキング ーネッケツノモノガタリー" }],
  ["dmart10-004", { name: "ガチャンコ ガチロボ", reading: "ガチャンコ ガチロボ" }],
  ["dmart10-005", { name: "奇天烈 シャッフ", reading: "キテレツ シャッフ" }],
  ["dmart10-006", { name: "最終龍覇 ロージア", reading: "サイシュウリュウハ ロージア" }],
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
