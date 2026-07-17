export type SearchMode = "broad" | "precise";

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

