export type ShoppingPriceKind = "sale" | "buy";
export type ShoppingPriceRecord = { canonicalCardId: number; shopId: number; shopName: string; salePrice: number | null; buyPrice: number | null; cardPrintId: number | null; observedOn: string; createdAt: string; id: number };
export type ShoppingCard = { id: number; name: string; imageUrl: string | null };
export type ShoppingListEntry = ShoppingCard & { price: number; rank: 1 | 2; minimumPrice: number; averagePrice: number };
export type ShoppingListStoreGroup = { shopId: number; shopName: string; entries: ShoppingListEntry[] };

function latestPerShop(records: ShoppingPriceRecord[]) {
  const hasCanonicalPrices = records.some((record) => record.cardPrintId === null);
  const eligible = records.filter((record) => hasCanonicalPrices ? record.cardPrintId === null : true);
  const ordered = [...eligible].sort((left, right) => right.observedOn.localeCompare(left.observedOn) || right.createdAt.localeCompare(left.createdAt) || right.id - left.id);
  const latest = new Map<number, ShoppingPriceRecord>();
  for (const record of ordered) if (!latest.has(record.shopId)) latest.set(record.shopId, record);
  return [...latest.values()];
}

export function buildShoppingListGroups(cards: ShoppingCard[], records: ShoppingPriceRecord[], kind: ShoppingPriceKind): ShoppingListStoreGroup[] {
  const groups = new Map<number, ShoppingListStoreGroup>();
  for (const card of cards) {
    const current = latestPerShop(records.filter((record) => record.canonicalCardId === card.id)).flatMap((record) => {
      const price = kind === "sale" ? record.salePrice : record.buyPrice;
      return price === null ? [] : [{ record, price }];
    });
    if (!current.length) continue;
    current.sort((left, right) => kind === "sale" ? left.price - right.price : right.price - left.price);
    const minimumPrice = Math.min(...current.map(({ price }) => price));
    const averagePrice = Math.round(current.reduce((sum, { price }) => sum + price, 0) / current.length);
    current.slice(0, 2).forEach(({ record, price }, index) => {
      const group = groups.get(record.shopId) ?? { shopId: record.shopId, shopName: record.shopName, entries: [] };
      group.entries.push({ ...card, price, rank: (index + 1) as 1 | 2, minimumPrice, averagePrice });
      groups.set(record.shopId, group);
    });
  }
  return [...groups.values()].map((group) => ({ ...group, entries: group.entries.sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, "ja")) })).sort((left, right) => left.shopName.localeCompare(right.shopName, "ja"));
}
