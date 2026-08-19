import type { RegistrationShopOption } from "./registration-lookup-mapping";

const LAST_REGISTERED_SHOP_STORAGE_KEY = "tcg-last-registered-shop";

type ShopStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type StorageFactory = () => ShopStorage;

const browserStorage: StorageFactory = () => window.localStorage;

function isStoredShop(value: unknown): value is RegistrationShopOption {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const shop = value as Record<string, unknown>;
  return (
    typeof shop.id === "number" &&
    Number.isSafeInteger(shop.id) &&
    shop.id > 0 &&
    typeof shop.name === "string" &&
    shop.name.trim().length > 0 &&
    shop.name.length <= 200 &&
    typeof shop.prefecture === "string" &&
    shop.prefecture.length <= 20 &&
    typeof shop.municipality === "string" &&
    shop.municipality.length <= 100
  );
}

export function readLastRegisteredShop(
  getStorage: StorageFactory = browserStorage,
): RegistrationShopOption | null {
  try {
    const value = getStorage().getItem(LAST_REGISTERED_SHOP_STORAGE_KEY);
    if (value === null) return null;

    const shop = JSON.parse(value);
    return isStoredShop(shop) ? shop : null;
  } catch {
    return null;
  }
}

export function writeLastRegisteredShop(
  shop: unknown,
  getStorage: StorageFactory = browserStorage,
): boolean {
  if (!isStoredShop(shop)) return false;

  try {
    getStorage().setItem(LAST_REGISTERED_SHOP_STORAGE_KEY, JSON.stringify(shop));
    return true;
  } catch {
    return false;
  }
}
