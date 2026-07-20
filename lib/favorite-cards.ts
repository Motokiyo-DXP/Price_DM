const FAVORITE_STORAGE_KEY = "tcg-favorites";
const MAX_FAVORITE_COUNT = 500;

type FavoriteStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type StorageFactory = () => FavoriteStorage;

const browserStorage: StorageFactory = () => window.localStorage;

function isCanonicalCardId(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0;
}

export function normalizeFavoriteCardIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const favorites: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isCanonicalCardId(item) || seen.has(item)) {
      continue;
    }

    seen.add(item);
    favorites.push(item);
    if (favorites.length === MAX_FAVORITE_COUNT) {
      break;
    }
  }

  return favorites;
}

export function readFavoriteCardIds(
  getStorage: StorageFactory = browserStorage,
): string[] {
  try {
    const rawValue = getStorage().getItem(FAVORITE_STORAGE_KEY);
    if (rawValue === null) {
      return [];
    }

    return normalizeFavoriteCardIds(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function writeFavoriteCardIds(
  favorites: unknown,
  getStorage: StorageFactory = browserStorage,
): boolean {
  try {
    getStorage().setItem(
      FAVORITE_STORAGE_KEY,
      JSON.stringify(normalizeFavoriteCardIds(favorites)),
    );
    return true;
  } catch {
    return false;
  }
}

export function toggleFavoriteCardId(
  favorites: unknown,
  cardId: string,
): string[] {
  const current = normalizeFavoriteCardIds(favorites);
  if (!isCanonicalCardId(cardId)) {
    return current;
  }

  return current.includes(cardId)
    ? current.filter((favoriteId) => favoriteId !== cardId)
    : normalizeFavoriteCardIds([...current, cardId]);
}
