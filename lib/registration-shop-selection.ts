export type ShopSelectionState<T> = {
  activeIndex: number;
  isComposing: boolean;
  options: readonly T[];
  searchComplete: boolean;
};

export function selectShopOption<T>({
  activeIndex,
  isComposing,
  options,
  searchComplete,
}: ShopSelectionState<T>): T | null {
  if (isComposing || !searchComplete || options.length === 0) return null;
  return options[activeIndex] ?? options[0] ?? null;
}

export function resolveSubmissionShop<T>({
  selectedShop,
  selection,
}: {
  selectedShop: T | null;
  selection: ShopSelectionState<T>;
}): T | null {
  return selectedShop ?? selectShopOption(selection);
}

export function updateRecentRegistrationShops<T extends { id: number }>(
  shops: readonly T[],
  shop: T,
): T[] {
  return [shop, ...shops.filter((current) => current.id !== shop.id)].slice(0, 5);
}
