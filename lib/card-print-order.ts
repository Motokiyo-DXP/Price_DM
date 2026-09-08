import { DM_PRODUCT_RELEASE_DATES } from "./dm-product-release-dates.ts";

export type OrderableCardPrint = {
  id: number;
  card_number?: string | null;
  product_name?: string | null;
  official_card_id?: string | null;
};

const productCodesByLength = Object.keys(DM_PRODUCT_RELEASE_DATES).sort((a, b) => b.length - a.length);

function normalizedProductText(value: string | null | undefined) {
  return value?.normalize("NFKC").replace(/[^A-Z0-9]/giu, "").toUpperCase() ?? "";
}

export function getCardPrintReleaseDate(print: OrderableCardPrint): string | null {
  const candidates = [normalizedProductText(print.card_number), normalizedProductText(print.product_name)];
  for (const code of productCodesByLength) {
    if (candidates.some((candidate) => candidate.includes(code))) return DM_PRODUCT_RELEASE_DATES[code];
  }
  return null;
}

function estimatedLegacyReleaseTime(print: OrderableCardPrint): number | null {
  const cardNumberProduct = print.card_number?.trim().split(/\s+/u)[0];
  const text = `${normalizedProductText(cardNumberProduct)} ${normalizedProductText(print.product_name)}`;
  const baseSet = text.match(/(?:^|\s)DM0?(\d{1,2})(?!\d)/u);
  if (baseSet) return Date.UTC(2002, 4, 30) + (Number(baseSet[1]) - 1) * 82 * 86_400_000;
  const classicDeck = text.match(/(?:^|\s)DMC0?(\d{1,2})(?!\d)/u);
  if (classicDeck && Number(classicDeck[1]) < 25) return Date.UTC(2003, 0, 1) + (Number(classicDeck[1]) - 1) * 40 * 86_400_000;
  const promoYear = text.match(/DMPROMOY(\d{2})/u);
  if (promoYear) return Date.UTC(2000 + Number(promoYear[1]), 0, 1);
  return null;
}

export function getCardPrintVariantRank(print: OrderableCardPrint): number {
  const cardNumber = print.card_number?.normalize("NFKC").toUpperCase() ?? "";
  const numberWithinProduct = cardNumber.trim().split(/\s+/u).slice(1).join(" ");
  const officialId = print.official_card_id?.normalize("NFKC").toUpperCase() ?? "";
  if (/DMPROMO|PROMOY/u.test(cardNumber) || /^PROMO/u.test(officialId)) return 2;
  if (/㊙|秘|超|金|銀|シークレット|SECRET|WINNER|^(?:SP|TR|TF)\d/u.test(numberWithinProduct)
    || /(?:SEC|CHO|-(?:SP|TR|TF)\d)/u.test(officialId)) return 1;
  return 0;
}

/** Oldest release first; unknown releases fall back to the source's newest-first import order. */
export function sortCardPrintsOldestFirst<T extends OrderableCardPrint>(prints: readonly T[]): T[] {
  return prints.map((print, index) => {
    const releaseDate = getCardPrintReleaseDate(print);
    return {
      print,
      index,
      releaseTime: releaseDate ? Date.parse(`${releaseDate}T00:00:00Z`) : estimatedLegacyReleaseTime(print),
      variantRank: getCardPrintVariantRank(print),
    };
  })
    .sort((left, right) => {
      if (left.releaseTime !== null && right.releaseTime !== null) {
        const dateOrder = left.releaseTime - right.releaseTime;
        if (dateOrder !== 0) return dateOrder;
      } else if (left.releaseTime !== null) return -1;
      else if (right.releaseTime !== null) return 1;
      if (left.variantRank !== right.variantRank) return left.variantRank - right.variantRank;
      return right.print.id - left.print.id || left.index - right.index;
    })
    .map(({ print }) => print);
}

export function pickCardPrintImageKey<T extends OrderableCardPrint & { image_key?: string | null }>(
  prints: readonly T[],
  preferredPrintId?: number | null,
): string | null {
  return prints.find((print) => print.id === preferredPrintId && print.image_key)?.image_key
    ?? sortCardPrintsOldestFirst(prints).find((print) => print.image_key)?.image_key
    ?? null;
}
