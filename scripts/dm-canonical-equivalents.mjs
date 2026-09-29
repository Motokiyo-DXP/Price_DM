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

// These are exact source-index/detail-page name pairs for the same official
// print IDs. Keep the match keyed by ID and exact strings; do not fuzzy-match.
export const DM_CARD_RULES_NAME_EQUIVALENTS = new Map([
  ["dm26rp3-028", { sourceName: "銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク", rulesName: "鉄初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク" }],
  ["dm17-014", { sourceName: "ファンタズ厶・クラッチ", rulesName: "ファンタズム・クラッチ" }],
  ["dm22ex1-048", { sourceName: "俺神豚 ブリタニア /「カツキング、俺とお前の勝負だ！」", rulesName: "俺神豚 ブリタニア / 「カツキング、俺とお前の勝負だ！」" }],
  ["dm28-008", { sourceName: "竜装ムシャ・レジェンド", rulesName: "竜装 ムシャ・レジェンド" }],
  ["dmex08-050", { sourceName: "ガチンコ・ル－レット", rulesName: "ガチンコ・ルーレット" }],
  ["dmex17-093", { sourceName: "爆龍覇 リンクウッド /「お前の相手はオレだ、ザ=デッドマン！」", rulesName: "爆龍覇 リンクウッド / 「お前の相手はオレだ、ザ=デッドマン！」" }],
  ["dmr04-s01", { sourceName: "偽りの名シャーロック", rulesName: "偽りの名 シャーロック" }],
  ["dmr10-050M", { sourceName: "妖精の裏技ラララ・ライフ", rulesName: "妖精の裏技 ラララ・ライフ" }],
  ["dmrp01-023", { sourceName: "ラウド NYZ ノイジー", rulesName: "ラウド “NYZ” ノイジー" }],
  ["dmrp01-s08", { sourceName: "ドープ DBL ボーダー", rulesName: "ドープ“DBL”ボーダー" }],
  ["dmrp05-055", { sourceName: "ワ・タンポ－ポ・タンク", rulesName: "ワ・タンポーポ・タンク" }],
  ["dmx22a-014", { sourceName: "ファンタズ厶・クラッチ", rulesName: "ファンタズム・クラッチ" }],
  ["dmx22b-014", { sourceName: "超法無敵宇宙合金武闘鼓笛魔槍絶頂百仙閻魔神拳銃極太陽友情暴剣R・M・G チーム・エグザイル ーカツドンと仲間たちー", rulesName: "超法無敵宇宙合金武闘鼓笛魔槍絶頂百仙閻魔神拳銃極太陽友情暴剣R・M・G チーム・エグザイル ～カツドンと仲間たち～" }],
]);

export function canonicalCardNameKey(name) {
  return typeof name === "string" ? name.trim().normalize("NFKC") : "";
}

export function normalizeDuelMastersRaceName(name) {
  return typeof name === "string" ? name.normalize("NFKC").replace(/\s+/gu, " ").trim() : "";
}

export function canonicalizeDuelMastersCard(card, officialCardId) {
  const canonical = DM_CANONICAL_EQUIVALENTS.get(officialCardId?.toLowerCase());
  return canonical ? { ...card, name: canonical.name, name_kana: canonical.reading } : card;
}

export function resolveDuelMastersRulesCanonicalName(source, rules, officialCardId) {
  const sourceName = canonicalizeDuelMastersCard(source, officialCardId).name?.trim();
  const rulesName = canonicalizeDuelMastersCard(rules, officialCardId).name?.trim();
  if (!sourceName || !rulesName) return null;
  if (canonicalCardNameKey(sourceName) === canonicalCardNameKey(rulesName)) return sourceName;

  const equivalent = DM_CARD_RULES_NAME_EQUIVALENTS.get(officialCardId);
  if (equivalent && source.name?.trim() === equivalent.sourceName && rules.name?.trim() === equivalent.rulesName) {
    return sourceName;
  }
  return null;
}
