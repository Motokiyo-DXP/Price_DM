export type SearchMode = "broad" | "precise";

const SHOP_SEARCH_READINGS = [
  ["flat", "ふらっと"],
  ["秋葉原", "あきはばら"],
  ["秘密基地", "ひみつきち"],
  ["らじお会館", "らじおかいかん"],
  ["会館", "かいかん"],
  ["買取センター", "かいとりせんたー"],
  ["駅前", "えきまえ"],
  ["本店", "ほんてん"],
  ["別館", "べっかん"],
  ["工房", "こうぼう"],
  ["福福", "ふくふく"],
  ["商会", "しょうかい"],
  ["遊亜王", "ゆうあおう"],
  ["竜星", "りゅうせい"],
  ["無線", "むせん"],
  ["晴れる屋", "はれるや"],
  ["東京", "とうきょう"],
  ["宮殿", "きゅうでん"],
  ["大明神", "だいみょうじん"],
  ["買賊王", "かいぞくおう"],
  ["梟", "ふくろう"],
  ["書庫", "しょこ"],
  ["買取", "かいとり"],
  ["号", "ごう"],
  ["番", "ばん"],
  ["店", "てん"],
  ["館", "かん"],
] as const;

export function normalizeJapaneseSearch(value: string) {
  const normalized = value.normalize("NFKC");
  let folded = "";

  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
      folded += String.fromCodePoint(codePoint - 0x60);
    } else if (character === "ヽ") {
      folded += "ゝ";
    } else if (character === "ヾ") {
      folded += "ゞ";
    } else {
      folded += character;
    }
  }

  return folded.toLocaleLowerCase("ja-JP").replace(/[\s・･·]/gu, "");
}

export function normalizeShopSearch(value: string) {
  let normalized = normalizeJapaneseSearch(value);
  for (const [source, reading] of SHOP_SEARCH_READINGS) {
    normalized = normalized.replaceAll(source, reading);
  }
  return normalized.replace(/[‐‑‒–—―−－ーｰ-]/gu, "");
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function searchTextMatches(
  query: string,
  candidates: Array<string | null | undefined>,
  mode: SearchMode,
) {
  const normalizedQuery = normalizeJapaneseSearch(query);
  if (!normalizedQuery) return true;
  const threshold = mode === "precise" ? 0.9 : 0.6;

  return candidates.some((candidate) => {
    if (!candidate) return false;
    const normalizedCandidate = normalizeJapaneseSearch(candidate);
    if (!normalizedCandidate) return false;
    if (
      normalizedCandidate === normalizedQuery ||
      normalizedCandidate.includes(normalizedQuery)
    ) {
      return true;
    }

    const longestLength = Math.max(
      normalizedCandidate.length,
      normalizedQuery.length,
    );
    const score =
      1 - levenshteinDistance(normalizedCandidate, normalizedQuery) / longestLength;
    return score >= threshold;
  });
}

