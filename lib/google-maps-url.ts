const GOOGLE_MAPS_SEARCH_URL = "https://www.google.com/maps/search/";

export function createGoogleMapsSearchUrl(shopName: string) {
  const query = shopName.trim();
  if (!query || query === "店舗未設定") return null;

  const url = new URL(GOOGLE_MAPS_SEARCH_URL);
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  return url.toString();
}
